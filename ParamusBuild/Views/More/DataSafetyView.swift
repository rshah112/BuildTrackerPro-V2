import SwiftData
import SwiftUI
import UIKit

/// Single screen the user can open to confirm "my data is safe":
///   • Snapshot of backup health (last backup, iCloud status, disk space)
///   • Manual "Back up now" action
///   • Reveal backups + media mirror in Files.app for off-device extraction
///   • Trash list with Restore / Delete Permanently
///   • Full Data Recovery flow entry point
struct DataSafetyView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var health = StorageHealthMonitor.shared

    @Query(
        filter: #Predicate<Project> { $0.deletedAt != nil },
        sort: \Project.deletedAt,
        order: .reverse
    ) private var trashedProjects: [Project]

    @State private var manualBackupInFlight = false
    @State private var manualBackupResult: ManualBackupResult?
    @State private var projectToPermanentlyDelete: Project?
    @State private var showingRecoveryFlow = false

    var body: some View {
        NavigationStack {
            List {
                if health.hasWarning, let message = health.bannerMessage {
                    Section {
                        Label(message, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                            .font(.subheadline)
                    }
                }

                Section("Backup status") {
                    statusRow(
                        title: "iCloud Drive",
                        value: iCloudStatusText,
                        icon: "icloud",
                        tint: health.iCloudAvailable == true ? .green : .secondary
                    )
                    statusRow(
                        title: "Last backup",
                        value: lastBackupText,
                        icon: "shippingbox",
                        tint: health.isBackupStale ? .orange : .green
                    )
                    statusRow(
                        title: "Available space",
                        value: availableSpaceText,
                        icon: "internaldrive",
                        tint: health.isDiskLow ? .orange : .secondary
                    )
                }

                Section("Backup actions") {
                    Button {
                        Task { await runManualBackup() }
                    } label: {
                        HStack {
                            Label("Back up now", systemImage: "arrow.up.doc")
                            Spacer()
                            if manualBackupInFlight {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(manualBackupInFlight)

                    Button {
                        openInFiles(BackupService.revealableBackupsURL())
                    } label: {
                        Label("Reveal Backups in Files", systemImage: "folder")
                    }

                    Button {
                        openInFiles(MediaStorageService.projectsRoot)
                    } label: {
                        Label("Reveal Media Files", systemImage: "photo.on.rectangle.angled")
                    }

                    Button {
                        showingRecoveryFlow = true
                    } label: {
                        Label("Open Recovery Center", systemImage: "lifepreserver")
                    }
                }

                if !trashedProjects.isEmpty {
                    Section("Trash (\(trashedProjects.count))") {
                        ForEach(trashedProjects) { project in
                            TrashRow(
                                project: project,
                                onRestore: { restore(project) },
                                onDelete: { projectToPermanentlyDelete = project }
                            )
                        }
                    }
                    Section {
                        Text("Projects in Trash are auto-deleted after \(Project.trashRetentionDays) days. Until then, Restore brings them back with every photo, expense and document intact.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Section("Trash") {
                        Text("No deleted projects. Anything you delete from Portfolio lands here for \(Project.trashRetentionDays) days before permanent removal.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("About backups") {
                    Text("HomeBuild Pro writes a full ZIP snapshot of all projects (data + photos + receipts + documents) to the Backups folder on every launch and after project changes. If iCloud Drive is signed in, snapshots are also mirrored there so they survive uninstall and device loss. The newest 30 snapshots are kept; older ones rotate out.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Data Safety")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                health.refresh()
            }
            .alert("Permanently delete?", isPresented: deleteAlertBinding, presenting: projectToPermanentlyDelete) { project in
                Button("Delete Forever", role: .destructive) {
                    permanentlyDelete(project)
                }
                Button("Cancel", role: .cancel) {
                    projectToPermanentlyDelete = nil
                }
            } message: { project in
                Text("\(project.name) and all of its data — budget, expenses, photos, documents, vendors, change orders, bids — will be removed for good. Backups in Files.app and iCloud Drive are NOT touched.")
            }
            .alert(
                manualBackupResult?.title ?? "",
                isPresented: manualBackupAlertBinding,
                presenting: manualBackupResult
            ) { _ in
                Button("OK", role: .cancel) { manualBackupResult = nil }
            } message: { result in
                Text(result.message)
            }
            .sheet(isPresented: $showingRecoveryFlow) {
                DataRecoveryView(onDismiss: { showingRecoveryFlow = false })
            }
        }
    }

    // MARK: - Status helpers

    private var iCloudStatusText: String {
        switch health.iCloudAvailable {
        case .some(true): "Available"
        case .some(false): "Not signed in"
        case .none: "Checking…"
        }
    }

    private var lastBackupText: String {
        guard let date = health.lastBackupDate else { return "Never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: .now)
    }

    private var availableSpaceText: String {
        guard let bytes = health.availableBytes else { return "—" }
        return ByteCountFormatter().string(fromByteCount: bytes)
    }

    private func statusRow(title: String, value: String, icon: String, tint: Color) -> some View {
        HStack {
            Label(title, systemImage: icon)
                .foregroundStyle(tint)
            Spacer()
            Text(value)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Bindings

    private var deleteAlertBinding: Binding<Bool> {
        Binding(
            get: { projectToPermanentlyDelete != nil },
            set: { if !$0 { projectToPermanentlyDelete = nil } }
        )
    }

    private var manualBackupAlertBinding: Binding<Bool> {
        Binding(
            get: { manualBackupResult != nil },
            set: { if !$0 { manualBackupResult = nil } }
        )
    }

    // MARK: - Actions

    private func runManualBackup() async {
        manualBackupInFlight = true
        defer { manualBackupInFlight = false }
        do {
            let snapshot = try BackupService.performAutomaticBackup(reason: .manual, context: modelContext)
            health.refresh()
            manualBackupResult = ManualBackupResult(
                title: "Backup saved",
                message: "Snapshot of \(snapshot.projectCount) project\(snapshot.projectCount == 1 ? "" : "s") written. \(snapshot.isInCloud ? "Also mirrored to iCloud Drive." : "iCloud Drive unavailable — local-only.")"
            )
        } catch BackupServiceError.noProjectsToBackup {
            manualBackupResult = ManualBackupResult(
                title: "Nothing to back up",
                message: "Create a project first."
            )
        } catch {
            manualBackupResult = ManualBackupResult(
                title: "Backup failed",
                message: error.localizedDescription
            )
        }
    }

    private func restore(_ project: Project) {
        project.restore()
        try? modelContext.save()
        Haptics.success()
    }

    private func permanentlyDelete(_ project: Project) {
        project.permanentlyDelete(in: modelContext)
        projectToPermanentlyDelete = nil
        Haptics.success()
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
}

private struct ManualBackupResult: Identifiable {
    let id = UUID()
    let title: String
    let message: String
}

private struct TrashRow: View {
    let project: Project
    let onRestore: () -> Void
    let onDelete: () -> Void

    private var deletedRelative: String {
        guard let deletedAt = project.deletedAt else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: deletedAt, relativeTo: .now)
    }

    private var daysRemaining: Int {
        guard let deletedAt = project.deletedAt else { return 0 }
        let expiry = Calendar.current.date(byAdding: .day, value: Project.trashRetentionDays, to: deletedAt) ?? .now
        return max(0, Calendar.current.dateComponents([.day], from: .now, to: expiry).day ?? 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(project.name)
                .font(.subheadline.weight(.semibold))
            Text("Deleted \(deletedRelative) • Auto-purges in \(daysRemaining) day\(daysRemaining == 1 ? "" : "s")")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                Button("Restore", action: onRestore)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                Spacer()
                Button("Delete Forever", role: .destructive, action: onDelete)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
            .padding(.top, 2)
        }
        .padding(.vertical, 4)
    }
}
