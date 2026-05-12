import SwiftData
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct ExportProjectView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]
    @Query private var documents: [ProjectDocument]
    @Query private var vendors: [Vendor]
    @Query private var allowanceSelections: [AllowanceSelection]

    @State private var activeArchive: ExportedArchive?
    @State private var exportError: String?
    @State private var showingImporter = false
    @State private var backupSnapshotCount = 0

    @ObservedObject private var health = StorageHealthMonitor.shared

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _documents = Query(filter: #Predicate<ProjectDocument> { $0.projectID == projectID }, sort: \.uploadedAt, order: .reverse)
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
        _allowanceSelections = Query(
            filter: #Predicate<AllowanceSelection> { $0.projectID == projectID },
            sort: \.selectionDate,
            order: .reverse
        )
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Export \(project.name)")
                        .font(.title3.weight(.bold))
                    Text("Choose what to include. Every export creates a timestamped ZIP file with a clear folder structure.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("Project Snapshot") {
                ExportValueRow(
                    title: "Status",
                    value: project.status.title,
                    systemImage: project.status.systemImage,
                    tint: AppTheme.projectStatusColor(project.status)
                )
                ExportValueRow(
                    title: "Priority",
                    value: project.priority.title,
                    systemImage: "flag.fill",
                    tint: AppTheme.projectPriorityColor(project.priority)
                )
                ExportValueRow(
                    title: "Budget",
                    value: project.constructionBudget.compactCurrencyString,
                    systemImage: "banknote",
                    tint: AppTheme.accent
                )
                ExportCountRow(title: "Budget items", count: items.count, systemImage: "list.bullet.rectangle")
                ExportCountRow(title: "Expenses", count: expenses.count, systemImage: "creditcard")
                ExportCountRow(title: "Photos", count: photos.count, systemImage: "photo")
                ExportCountRow(title: "Documents", count: documents.count, systemImage: "doc")
                ExportCountRow(title: "Vendors", count: vendors.count, systemImage: "person.2")
                ExportCountRow(title: "Allowance selections", count: allowanceSelections.count, systemImage: "square.stack.3d.up")
            }

            Section("What would you like to export?") {
                ForEach(ProjectExportScope.allCases) { scope in
                    Button {
                        export(scope)
                    } label: {
                        MoreRow(title: scope.title, subtitle: scope.subtitle, systemImage: scope.systemImage)
                    }
                    .foregroundStyle(.primary)
                }
            }

            Section("Import") {
                Button {
                    showingImporter = true
                } label: {
                    MoreRow(
                        title: "Import Edited Workbook",
                        subtitle: "Select the edited Excel workbook or the exported ZIP",
                        systemImage: "square.and.arrow.down"
                    )
                }
                .foregroundStyle(.primary)
            }

            Section {
                ExportValueRow(
                    title: "Last automatic backup",
                    value: lastBackupText,
                    systemImage: "shippingbox",
                    tint: health.isBackupStale ? AppTheme.warning : AppTheme.positive
                )
                ExportCountRow(title: "Backup snapshots on disk", count: backupSnapshotCount, systemImage: "archivebox")
                Button {
                    openInFiles(BackupService.revealableBackupsURL())
                } label: {
                    MoreRow(
                        title: "Reveal Backups in Files",
                        subtitle: health.iCloudAvailable == true ? "iCloud Drive › HomeBuild Pro › Backups" : "On My iPhone › HomeBuild Pro › Backups",
                        systemImage: "folder"
                    )
                }
                .foregroundStyle(.primary)
            } header: {
                Text("Automatic backups")
            } footer: {
                Text("Manual exports above produce a single ZIP you can share. The app also writes rotating ZIP snapshots automatically on every launch and after project changes — those live in the Backups folder above and survive uninstall when iCloud Drive is on.")
            }

            if let exportError {
                Section {
                    Text(exportError)
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.negative)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Export")
        .sheet(item: $activeArchive) { archive in
            ActivityView(url: archive.url)
        }
        .fileImporter(
            isPresented: $showingImporter,
            allowedContentTypes: ExportImportFileTypes.allowedTypes,
            allowsMultipleSelection: false
        ) { result in
            importWorkbook(result)
        }
        .onAppear {
            health.refresh()
            backupSnapshotCount = BackupService.availableBackups().count
        }
    }

    private var lastBackupText: String {
        guard let date = health.lastBackupDate else { return "Never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: .now)
    }

    private func openInFiles(_ url: URL) {
        var components = URLComponents()
        components.scheme = "shareddocuments"
        components.path = url.path
        if let shareURL = components.url, UIApplication.shared.canOpenURL(shareURL) {
            UIApplication.shared.open(shareURL)
        } else {
            UIApplication.shared.open(url)
        }
    }

    private func export(_ scope: ProjectExportScope) {
        do {
            let changeOrders = fetchChangeOrders()
            let url = try ProjectExportService.createArchive(
                project: project,
                scope: scope,
                items: items,
                expenses: expenses,
                photos: photos,
                documents: documents,
                changeOrders: changeOrders,
                vendors: vendors,
                allowanceSelections: allowanceSelections
            )
            activeArchive = ExportedArchive(url: url)
            exportError = nil
            Haptics.success()
        } catch {
            exportError = error.localizedDescription
        }
    }

    private func importWorkbook(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let isScoped = url.startAccessingSecurityScopedResource()
            defer {
                if isScoped {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            let data = try Data(contentsOf: url)
            let changeOrders = fetchChangeOrders()
            try ProjectWorkbookService.importWorkbook(
                data: data,
                project: project,
                items: items,
                expenses: expenses,
                changeOrders: changeOrders,
                vendors: vendors,
                allowanceSelections: allowanceSelections,
                context: modelContext
            )
            try modelContext.save()
            exportError = nil
            Haptics.success()
        } catch {
            exportError = "Import failed: \(error.localizedDescription)"
        }
    }

    private func fetchChangeOrders() -> [ChangeOrder] {
        let projectID = project.id
        let descriptor = FetchDescriptor<ChangeOrder>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }
}

private struct ExportedArchive: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ExportCountRow: View {
    let title: String
    let count: Int
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 30, height: 30)
                .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            Text(title)
                .font(.subheadline.weight(.semibold))

            Spacer()

            Text("\(count)")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.secondary)
        }
    }
}

private struct ExportValueRow: View {
    let title: String
    let value: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            Text(title)
                .font(.subheadline.weight(.semibold))

            Spacer()

            Text(value)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
    }
}

private enum ExportImportFileTypes {
    static var allowedTypes: [UTType] {
        [
            UTType(filenameExtension: "zip") ?? .archive,
            UTType(filenameExtension: "xls") ?? .spreadsheet,
            .xml,
            .spreadsheet,
            .data
        ]
    }
}

private struct ActivityView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
