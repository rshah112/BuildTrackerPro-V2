import SwiftUI
import UIKit

/// Shown when:
///   1. The SwiftData container failed to open at launch (presented from HomeBuildProApp).
///   2. The user manually navigates here from Settings → Data Safety → Restore.
///
/// In both cases the goal is to make the user confident that their data is recoverable
/// even if the on-device database is broken: backups exist in Files.app + iCloud,
/// the on-disk media mirror is intact, and the corrupted store can be reset safely.
struct DataRecoveryView: View {
    /// When non-nil, the view is presented in "post-crash" mode and shows the failure context.
    let launchFailure: Error?

    /// Closure to dismiss back to normal app flow. In post-crash mode the caller drives a relaunch.
    let onDismiss: () -> Void

    @State private var snapshots: [BackupSnapshot] = []
    @State private var showingResetConfirm = false
    @State private var resetCompleted = false

    init(launchFailure: Error? = nil, onDismiss: @escaping () -> Void = {}) {
        self.launchFailure = launchFailure
        self.onDismiss = onDismiss
    }

    var body: some View {
        NavigationStack {
            List {
                if let failure = launchFailure {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Label("Data store didn't open", systemImage: "exclamationmark.triangle.fill")
                                .font(.headline)
                                .foregroundStyle(.orange)
                            Text("HomeBuild Pro couldn't open its database this launch. Your photos, receipts and document files are still on disk and any iCloud backups are safe.")
                                .font(.subheadline)
                            Text(failure.localizedDescription)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }

                Section("Available backups") {
                    if snapshots.isEmpty {
                        Text("No backup snapshots found yet. If you've used the app before, look in Files.app under 'On My iPhone › HomeBuild Pro › Backups' or iCloud Drive › HomeBuild Pro › Backups.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(snapshots) { snapshot in
                            HStack(alignment: .top) {
                                Image(systemName: snapshot.isInCloud ? "icloud.fill" : "iphone")
                                    .foregroundStyle(snapshot.isInCloud ? .blue : .secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(snapshot.displayName)
                                        .font(.subheadline.weight(.semibold))
                                    Text("\(snapshot.projectCount) project\(snapshot.projectCount == 1 ? "" : "s") • \(snapshot.isInCloud ? "iCloud Drive" : "On My iPhone")")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }

                Section("Recover your data") {
                    Button {
                        openInFiles(BackupService.revealableBackupsURL())
                    } label: {
                        Label("Reveal Backups in Files", systemImage: "folder")
                    }

                    Button {
                        openInFiles(MediaStorageService.projectsRoot)
                    } label: {
                        Label("Reveal Media Mirror in Files", systemImage: "photo.on.rectangle.angled")
                    }
                }

                if launchFailure != nil {
                    Section("Reset corrupted store") {
                        Button(role: .destructive) {
                            showingResetConfirm = true
                        } label: {
                            Label("Delete corrupted database & start fresh", systemImage: "trash")
                        }
                        Text("Wipes the broken database file only. Your Backups/ and Projects/ folders are NOT touched — you can re-import projects from a backup ZIP using Settings → Export / Import after the app restarts.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("How recovery works") {
                    VStack(alignment: .leading, spacing: 6) {
                        recoveryStep(
                            "1. The Backups folder above contains a snapshot per project.",
                            icon: "shippingbox"
                        )
                        recoveryStep(
                            "2. Each per-project ZIP holds a workbook (.xls) plus every photo, document, and receipt as a regular file.",
                            icon: "doc.zipper"
                        )
                        recoveryStep(
                            "3. After a wipe, reinstall HomeBuild Pro, create a fresh project shell, then use Export / Import → Import to load the workbook back in.",
                            icon: "arrow.down.doc"
                        )
                        recoveryStep(
                            "4. Photos and documents inside the ZIP can be re-added through the Photos and Documents screens.",
                            icon: "photo.stack"
                        )
                    }
                    .padding(.vertical, 4)
                }

                if launchFailure == nil {
                    Section {
                        Button("Done") {
                            onDismiss()
                        }
                    }
                }
            }
            .navigationTitle("Data Safety")
            .toolbar {
                if launchFailure == nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Done") { onDismiss() }
                    }
                }
            }
            .onAppear {
                snapshots = BackupService.availableBackups()
            }
            .alert("Delete corrupted database?", isPresented: $showingResetConfirm) {
                Button("Delete", role: .destructive) {
                    resetStore()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The database file will be deleted and the app will close. Your backups and media files will NOT be touched. Relaunch the app to start fresh, then re-import from a backup if needed.")
            }
            .alert("Database deleted", isPresented: $resetCompleted) {
                Button("Close App") {
                    exit(0)
                }
            } message: {
                Text("Quit and relaunch HomeBuild Pro to continue. Your backups in Files.app and iCloud Drive are intact.")
            }
        }
    }

    @ViewBuilder
    private func recoveryStep(_ text: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(.blue)
                .frame(width: 20, alignment: .center)
            Text(text)
                .font(.caption)
                .foregroundStyle(.primary)
        }
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

    private func resetStore() {
        let fm = FileManager.default
        guard let supportDir = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return }
        let candidates = (try? fm.contentsOfDirectory(at: supportDir, includingPropertiesForKeys: nil)) ?? []
        for url in candidates where url.lastPathComponent.hasPrefix("HomeBuildPro.store") {
            try? fm.removeItem(at: url)
        }
        resetCompleted = true
    }
}
