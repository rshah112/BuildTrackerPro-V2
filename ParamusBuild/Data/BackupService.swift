import Foundation
import SwiftData

enum BackupReason: String {
    case launch
    case projectMutation
    case manual
    case beforeTrashPurge
}

struct BackupSnapshot: Identifiable, Hashable {
    let id: UUID
    let folderURL: URL
    let timestamp: Date
    let projectCount: Int
    let isInCloud: Bool

    var displayName: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: timestamp)
    }
}

enum BackupServiceError: Error {
    case noProjectsToBackup
    case mediaUnavailable
}

/// Disaster-recovery backups for HomeBuild Pro.
///
/// Each snapshot is a folder named `HomeBuildPro-<timestamp>/` that contains one
/// `ProjectExportService` ZIP per project (scope: `.all`), plus a manifest. Snapshots are
/// written to:
///
///   1. `Documents/Backups/`  — always; visible in Files.app under "On My iPhone".
///   2. `<iCloud-Documents>/Backups/` — when the iCloud entitlement + signed-in account
///      are available. Survives app uninstall and re-signing.
///
/// Retention: keep the newest 30 snapshots per location, prune the rest.
///
/// To restore: open Files.app, navigate into a snapshot folder, and use HomeBuild Pro's
/// existing Import flow (Settings → Export / Import) on the per-project workbook ZIP.
/// Automated restore that reattaches photos / documents in one tap is a planned follow-up.
enum BackupService {
    private static let snapshotPrefix = "HomeBuildPro-"
    private static let manifestFileName = "snapshot-manifest.txt"
    private static let readmeFileName = "README.txt"
    private static let retentionCount = 30
    private static let lastBackupAttemptKey = "BackupServiceLastAttempt"

    // MARK: - Roots

    /// Always-available local backups folder inside the app sandbox.
    static var localBackupsRoot: URL {
        let url = MediaStorageService.documentsRoot.appending(path: "Backups", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        ensureReadme(at: url)
        return url
    }

    /// iCloud Drive backups folder, or nil if iCloud isn't configured / signed in.
    static var iCloudBackupsRoot: URL? {
        guard let container = FileManager.default.url(forUbiquityContainerIdentifier: nil) else { return nil }
        let documents = container.appending(path: "Documents", directoryHint: .isDirectory)
        let backups = documents.appending(path: "Backups", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: backups, withIntermediateDirectories: true)
        ensureReadme(at: backups)
        return backups
    }

    // MARK: - Public API

    /// Creates a backup snapshot if no backup has succeeded in the last 6 hours. Safe to call
    /// on every launch — cheap when not due. Returns the snapshot if one was created, else nil.
    @MainActor
    @discardableResult
    static func performIfDue(reason: BackupReason, context: ModelContext) -> BackupSnapshot? {
        let last = lastBackupDate()
        let due = last.map { Date().timeIntervalSince($0) > 6 * 60 * 60 } ?? true
        guard due else { return nil }
        return try? performAutomaticBackup(reason: reason, context: context)
    }

    /// Creates a backup snapshot immediately. Throws on I/O errors. Returns the snapshot URL.
    ///
    /// Scope: we INCLUDE soft-deleted projects in every snapshot intentionally — if a user
    /// trashes a project and then the 30-day auto-purge runs, the backup is still the only
    /// remaining record. Restored backups carry `deletedAt` back too, so trashed projects
    /// reappear in the Trash list rather than the live Portfolio. This is the safer default
    /// for a disaster-recovery feature.
    ///
    /// Concurrency: marked `@MainActor` because SwiftData fetches must run on the main
    /// context's actor. The ZIP construction + file writes that follow could be off-main,
    /// but @Model instances aren't Sendable so refactoring requires a snapshot-to-value-types
    /// pass first. For a typical solo project (one active build, low-thousands of media
    /// files) the on-main implementation takes 1-3s and is acceptable.
    @MainActor
    @discardableResult
    static func performAutomaticBackup(reason: BackupReason, context: ModelContext) throws -> BackupSnapshot {
        let allProjects = try context.fetch(FetchDescriptor<Project>())
        guard !allProjects.isEmpty else { throw BackupServiceError.noProjectsToBackup }

        let timestamp = Self.currentTimestamp()
        let snapshotFolderName = "\(snapshotPrefix)\(timestamp)"
        let tmpFolder = FileManager.default.temporaryDirectory.appending(path: snapshotFolderName, directoryHint: .isDirectory)
        try? FileManager.default.removeItem(at: tmpFolder)
        try FileManager.default.createDirectory(at: tmpFolder, withIntermediateDirectories: true)
        // If we throw partway through, don't leave a half-built snapshot tree in /tmp.
        // After a successful move into Backups/, tmpFolder no longer exists and the
        // try? swallows the no-op.
        defer { try? FileManager.default.removeItem(at: tmpFolder) }

        var perProjectStats: [(name: String, sizeBytes: Int)] = []

        for project in allProjects {
            let projectID = project.id
            let items = (try? context.fetch(FetchDescriptor<BudgetLineItem>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
            let expenses = (try? context.fetch(FetchDescriptor<Expense>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
            let photos = (try? context.fetch(FetchDescriptor<PhotoAttachment>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
            let documents = (try? context.fetch(FetchDescriptor<ProjectDocument>(predicate: #Predicate { $0.projectID == projectID }))) ??
                []
            let changeOrders = (try? context.fetch(FetchDescriptor<ChangeOrder>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
            let vendors = (try? context.fetch(FetchDescriptor<Vendor>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
            let allowanceSelections = (try? context
                .fetch(FetchDescriptor<AllowanceSelection>(predicate: #Predicate { $0.projectID == projectID }))) ?? []

            let archiveURL = try ProjectExportService.createArchive(
                project: project,
                scope: .all,
                items: items,
                expenses: expenses,
                photos: photos,
                documents: documents,
                changeOrders: changeOrders,
                vendors: vendors,
                allowanceSelections: allowanceSelections
            )

            let dest = tmpFolder.appending(path: archiveURL.lastPathComponent)
            try? FileManager.default.removeItem(at: dest)
            try FileManager.default.moveItem(at: archiveURL, to: dest)

            let size = (try? dest.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            perProjectStats.append((name: project.name, sizeBytes: size))
        }

        // Snapshot manifest
        let manifestText = Self.makeManifest(reason: reason, timestamp: timestamp, projects: perProjectStats)
        let manifestURL = tmpFolder.appending(path: manifestFileName)
        try manifestText.write(to: manifestURL, atomically: true, encoding: .utf8)

        // Move into local Backups/, replacing any prior folder with the same name (same-second collision).
        let localRoot = localBackupsRoot
        let localDest = localRoot.appending(path: snapshotFolderName, directoryHint: .isDirectory)
        try? FileManager.default.removeItem(at: localDest)
        try FileManager.default.moveItem(at: tmpFolder, to: localDest)

        // Mirror to iCloud if available. Best-effort: failures don't break the local backup.
        var snapshotIsInCloud = false
        if let iCloudRoot = iCloudBackupsRoot {
            let iCloudDest = iCloudRoot.appending(path: snapshotFolderName, directoryHint: .isDirectory)
            try? FileManager.default.removeItem(at: iCloudDest)
            do {
                try FileManager.default.copyItem(at: localDest, to: iCloudDest)
                snapshotIsInCloud = true
            } catch {
                // Leave snapshotIsInCloud false — caller surfaces via StorageHealthMonitor.
            }
        }

        Self.pruneOldSnapshots(in: localRoot)
        if let iCloudRoot = iCloudBackupsRoot {
            Self.pruneOldSnapshots(in: iCloudRoot)
        }

        StorageHealthMonitor.shared.reportBackupSucceeded(at: .now)

        return BackupSnapshot(
            id: UUID(),
            folderURL: localDest,
            timestamp: .now,
            projectCount: perProjectStats.count,
            isInCloud: snapshotIsInCloud
        )
    }

    /// All available snapshots across local + iCloud, newest first. iCloud snapshots are merged
    /// by folder name so duplicates don't appear.
    static func availableBackups() -> [BackupSnapshot] {
        let local = snapshots(in: localBackupsRoot, isInCloud: false)
        let iCloud = iCloudBackupsRoot.map { snapshots(in: $0, isInCloud: true) } ?? []

        var bestByName: [String: BackupSnapshot] = [:]
        for snap in local + iCloud {
            let name = snap.folderURL.lastPathComponent
            if let existing = bestByName[name], existing.isInCloud { continue }
            bestByName[name] = snap
        }
        return bestByName.values.sorted { $0.timestamp > $1.timestamp }
    }

    static func lastBackupDate() -> Date? {
        availableBackups().first?.timestamp
    }

    /// Returns a URL suitable for opening Files.app at the Backups folder.
    static func revealableBackupsURL() -> URL {
        iCloudBackupsRoot ?? localBackupsRoot
    }

    // MARK: - Internals

    private static func snapshots(in root: URL, isInCloud: Bool) -> [BackupSnapshot] {
        let fm = FileManager.default
        let urls = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey])) ?? []
        return urls.compactMap { url -> BackupSnapshot? in
            let name = url.lastPathComponent
            guard name.hasPrefix(snapshotPrefix) else { return nil }
            let timestampSlug = String(name.dropFirst(snapshotPrefix.count))
            guard let date = Self.parseTimestamp(timestampSlug) else { return nil }
            let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            guard isDir else { return nil }
            let projectCount = (try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: nil))?
                .filter { $0.pathExtension.lowercased() == "zip" }.count ?? 0
            // Hide empty folders: a snapshot with zero project ZIPs is a half-finished
            // write or stray directory, never a usable restore target. Surfacing it as
            // "0 projects" would make the user think they have backups they don't.
            guard projectCount > 0 else { return nil }
            return BackupSnapshot(
                id: UUID(),
                folderURL: url,
                timestamp: date,
                projectCount: projectCount,
                isInCloud: isInCloud
            )
        }
    }

    private static func pruneOldSnapshots(in root: URL) {
        let fm = FileManager.default
        let urls = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        let snapshotURLs = urls.filter { $0.lastPathComponent.hasPrefix(snapshotPrefix) }
        let sorted = snapshotURLs.sorted { $0.lastPathComponent > $1.lastPathComponent }
        guard sorted.count > retentionCount else { return }
        for url in sorted.dropFirst(retentionCount) {
            try? fm.removeItem(at: url)
        }
    }

    private static func ensureReadme(at folder: URL) {
        let readmeURL = folder.appending(path: readmeFileName)
        guard !FileManager.default.fileExists(atPath: readmeURL.path) else { return }
        let text = """
        HomeBuild Pro — Backups

        This folder holds rotating ZIP snapshots of all your projects. Each snapshot
        is a folder named HomeBuildPro-YYYYMMDD-HHmmss containing one ZIP per project
        plus a snapshot-manifest.txt summary.

        Each project ZIP contains:
          • Data/<project>-Data-<timestamp>.xls — full structured data (budget,
            expenses, vendors, change orders, allowances) in SpreadsheetML format
            that opens in Excel, Numbers, and HomeBuild Pro's own Import flow.
          • Photos/<folder>/<photo>.jpg — every jobsite photo
          • Documents/<kind>/<file>          — surveys, permits, plans, contracts
          • Documents/Receipts & Warranties/ — receipt images from expenses
          • Export Manifest.txt              — counts and project metadata

        Retention: the newest 30 snapshots are kept; older ones are auto-pruned.

        To restore after an app uninstall or store corruption:
          1. Reinstall HomeBuild Pro and launch it (a fresh empty install is fine).
          2. Open Settings → Data Safety → Reveal Backups in Files (or just browse
             this folder directly in Files.app).
          3. Use Settings → Export / Import → Import on the per-project workbook
             ZIP to restore structured data.
          4. Photos and documents are inside each ZIP and can be re-imported
             through the relevant screens (Photos, Documents).

        Tip: copying this entire folder to a Mac via Finder, or dragging it into
        iCloud Drive in Files.app, gives you an off-device archive you can keep
        forever.
        """
        try? text.write(to: readmeURL, atomically: true, encoding: .utf8)
    }

    private static func makeManifest(reason: BackupReason, timestamp: String, projects: [(name: String, sizeBytes: Int)]) -> String {
        let totalBytes = projects.reduce(0) { $0 + $1.sizeBytes }
        let lines = projects.map { "  • \($0.name) — \(formatBytes($0.sizeBytes))" }.joined(separator: "\n")
        return """
        HomeBuild Pro Backup Snapshot

        Created: \(timestamp)
        Trigger: \(reason.rawValue)
        Projects: \(projects.count)
        Total size: \(formatBytes(totalBytes))

        Per-project archives:
        \(lines)
        """
    }

    private static func formatBytes(_ bytes: Int) -> String {
        ByteCountFormatter().string(fromByteCount: Int64(bytes))
    }

    // MARK: - Timestamp helpers

    private static func currentTimestamp(date: Date = .now) -> String {
        let formatter = Self.timestampFormatter
        return formatter.string(from: date)
    }

    private static func parseTimestamp(_ string: String) -> Date? {
        timestampFormatter.date(from: string)
    }

    private static let timestampFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC") ?? .current
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter
    }()
}
