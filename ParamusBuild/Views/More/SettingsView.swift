import SwiftData
import SwiftUI

struct SettingsView: View {
    @AppStorage(AppSettingsKeys.preferLargeControls) private var preferLargeControls = true
    @AppStorage(AppSettingsKeys.showCentsInExports) private var showCentsInExports = true
    @AppStorage(AppSettingsKeys.autoFillFromScans) private var autoFillFromScans = true

    @ObservedObject private var health = StorageHealthMonitor.shared

    @State private var showingDataSafety = false
    @State private var backupCount = 0

    var body: some View {
        List {
            dataSafetySection
            jobsiteSection
            exportsSection
            diagnosticsSection
            aboutSection
        }
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Settings")
        .sheet(isPresented: $showingDataSafety) {
            DataSafetyView()
        }
        .onAppear {
            health.refresh()
            backupCount = BackupService.availableBackups().count
        }
        .onChange(of: health.lastBackupDate) { _, _ in
            backupCount = BackupService.availableBackups().count
        }
    }

    // MARK: - Sections

    private var dataSafetySection: some View {
        Section {
            statusRow(
                "iCloud Drive",
                value: iCloudStatusText,
                systemImage: "icloud",
                tint: health.iCloudAvailable == true ? .green : .secondary
            )
            statusRow(
                "Last backup",
                value: lastBackupText,
                systemImage: "shippingbox",
                tint: health.isBackupStale ? .orange : .green
            )
            statusRow(
                "Available space",
                value: availableSpaceText,
                systemImage: "internaldrive",
                tint: health.isDiskLow ? .orange : .secondary
            )
            Button {
                showingDataSafety = true
            } label: {
                Label("Manage backups & Trash", systemImage: "shield.lefthalf.filled")
            }
        } header: {
            Text("Data safety")
        } footer: {
            Text("Automatic ZIP snapshots run on launch and after every project change. With iCloud Drive signed in, snapshots are also mirrored outside the app sandbox so they survive uninstall, re-signing and device loss.")
        }
    }

    private var jobsiteSection: some View {
        Section {
            Toggle("Large touch targets", isOn: $preferLargeControls)
            Toggle("Auto-fill from receipt scans", isOn: $autoFillFromScans)
        } header: {
            Text("Jobsite")
        } footer: {
            Text("Large targets size buttons and form fields up for gloved use on a phone in the field. Auto-fill pre-populates new expense forms from receipt OCR.")
        }
    }

    private var exportsSection: some View {
        Section {
            Toggle("Include cents in exports", isOn: $showCentsInExports)
        } header: {
            Text("Exports")
        } footer: {
            Text("Spreadsheets and ZIP exports include fractional cents when this is on. The in-app dashboard always rounds to whole dollars for readability — all aggregation runs on cent-exact math regardless of this setting.")
        }
    }

    private var diagnosticsSection: some View {
        Section {
            LabeledContent("Backup snapshots", value: "\(backupCount)")
            LabeledContent("Trash retention", value: "\(Project.trashRetentionDays) days")
            LabeledContent("Available space", value: availableSpaceText)
            LabeledContent("iCloud container") {
                Text(iCloudContainerIdentifier)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        } header: {
            Text("Diagnostics")
        } footer: {
            Text("If iCloud Drive shows as unavailable, make sure you're signed into iCloud in iOS Settings AND the iCloud capability is enabled for this App ID in the Apple Developer portal.")
        }
    }

    private var aboutSection: some View {
        Section("About") {
            LabeledContent("App", value: "HomeBuild Pro")
            LabeledContent("Version", value: AppInfo.versionString)
            LabeledContent("Bundle ID") {
                Text(bundleIdentifier)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
    }

    // MARK: - Computed display values

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

    private var bundleIdentifier: String {
        Bundle.main.bundleIdentifier ?? "—"
    }

    private var iCloudContainerIdentifier: String {
        "iCloud.\(bundleIdentifier)"
    }

    // MARK: - Reusable rows

    private func statusRow(_ title: String, value: String, systemImage: String, tint: Color) -> some View {
        HStack {
            Label(title, systemImage: systemImage)
                .foregroundStyle(tint)
            Spacer()
            Text(value)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}
