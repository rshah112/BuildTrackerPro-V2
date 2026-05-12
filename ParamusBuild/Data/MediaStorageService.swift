import Foundation
import SwiftData
import UIKit

enum MediaStorageError: Error {
    case outOfSpace
    case writeFailed(underlying: Error)
}

/// On-disk mirror of every binary asset (receipts, jobsite photos, project documents)
/// in a folder structure that's:
/// - Visible in iOS Files.app under "On My iPhone › HomeBuild Pro" (enabled via
///   `LSSupportsOpeningDocumentsInPlace` + `UIFileSharingEnabled` in Info.plist).
/// - Browseable independent of SwiftData — if the app is corrupt or uninstalled,
///   the user (or restored install) can read the files directly.
/// - Auto-organized by project so a single project can be backed up/restored.
///
/// Layout under `Documents/`:
///
///     Documents/
///       README.txt
///       Projects/
///         <SafeProjectName>-<projectIDPrefix>/
///           Receipts/
///             2025-08-12-HomeDepot-<expenseIDPrefix>.jpg
///           Photos/
///             <Folder>/
///               2025-08-12-Kitchen-<photoIDPrefix>.jpg
///           Documents/
///             <Kind>/
///               <fileName>
///       Backups/
///         HomeBuildPro-YYYYMMDD-HHmmss.zip
///
/// SwiftData's external storage (`@Attribute(.externalStorage)`) is kept as the in-DB
/// source of truth for reads inside the app. This service writes a parallel copy that
/// the user can extract or restore manually.
enum MediaStorageService {
    private static let fileManager = FileManager.default

    // MARK: - Roots

    static var documentsRoot: URL {
        fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
    }

    static var projectsRoot: URL {
        documentsRoot.appending(path: "Projects", directoryHint: .isDirectory)
    }

    static func projectFolder(project: Project) -> URL {
        let safe = project.name.safeFolderComponent
        let prefix = String(project.id.uuidString.prefix(6))
        return projectsRoot.appending(path: "\(safe)-\(prefix)", directoryHint: .isDirectory)
    }

    // MARK: - First-launch onboarding

    /// Idempotent: writes a README and ensures the Projects folder exists. Safe to call
    /// on every launch.
    static func ensureBootstrapped() {
        try? fileManager.createDirectory(at: projectsRoot, withIntermediateDirectories: true)
        let readmeURL = documentsRoot.appending(path: "README.txt")
        if !fileManager.fileExists(atPath: readmeURL.path) {
            try? readmeText.write(to: readmeURL, atomically: true, encoding: .utf8)
        }
    }

    private static let readmeText = """
    HomeBuild Pro — On-Device Storage

    This folder is the user-facing copy of every asset in the app. You can browse
    it in Files.app under "On My iPhone › HomeBuild Pro".

    Layout:

      Projects/
        <ProjectName>-<id>/
          Receipts/   — receipt and invoice images attached to expenses
          Photos/     — jobsite photos, organized by folder (Daily Progress, etc.)
          Documents/  — surveys, permits, plans, contracts, etc.
      Backups/
        HomeBuildPro-YYYYMMDD-HHmmss.zip — full app data + media snapshots

    Why a separate folder hierarchy:
      - The app's internal database (SwiftData) is the source of truth in-app, but
        it's an opaque sqlite file. This folder is the human-readable mirror.
      - Files here are visible in Files.app and can be copied to a Mac, dragged
        into iCloud Drive, AirDropped, or emailed for off-device backup.
      - On reinstall after deletion, files in the iOS app sandbox are also deleted.
        The app writes rotating ZIP backups into Backups/ on every launch and after
        any project change. If iCloud Drive is enabled in Settings → Data Safety,
        backups are ALSO mirrored to iCloud and survive uninstall automatically.
      - To restore after a wipe/reinstall: relaunch the app, open Settings →
        Data Safety → Restore from backup, and pick a ZIP.
    """

    // MARK: - Receipts (expenses)

    @discardableResult
    static func saveReceipt(
        data: Data,
        project: Project,
        expense: Expense
    ) throws -> URL {
        let folder = projectFolder(project: project).appending(path: "Receipts", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        removeReceipt(for: expense, project: project)

        let dateSlug = expense.date.fileDateString
        let vendorSlug = expense.vendorName.safeFolderComponent
        let idPrefix = String(expense.id.uuidString.prefix(6))
        let name = [dateSlug, vendorSlug, idPrefix].filter { !$0.isEmpty }.joined(separator: "-")
        let url = folder.appending(path: "\(name).jpg")
        try writeAtomically(data: data, to: url)
        return url
    }

    /// Returns receipt-image URLs for a project, newest first.
    static func receiptURLs(for project: Project) -> [URL] {
        let folder = projectFolder(project: project).appending(path: "Receipts", directoryHint: .isDirectory)
        let urls = (try? fileManager.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        )) ?? []
        return urls.sorted {
            let lhs = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let rhs = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return lhs > rhs
        }
    }

    static func removeReceipt(for expense: Expense, project: Project) {
        removeReceipt(id: expense.id, project: project)
    }

    static func removeReceipt(id: UUID, project: Project) {
        let folder = projectFolder(project: project).appending(path: "Receipts", directoryHint: .isDirectory)
        removeMirroredFiles(under: folder, idPrefix: String(id.uuidString.prefix(6)))
    }

    // MARK: - Photos

    @discardableResult
    static func savePhoto(
        data: Data,
        project: Project,
        photo: PhotoAttachment
    ) throws -> URL {
        let folderName = photo.phaseTag.safeFolderComponent
        let folder = projectFolder(project: project)
            .appending(path: "Photos", directoryHint: .isDirectory)
            .appending(path: folderName.isEmpty ? "Uncategorized" : folderName, directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        removePhoto(for: photo, project: project)

        let dateSlug = photo.createdAt.fileDateString
        let roomSlug = photo.roomTag.safeFolderComponent
        let idPrefix = String(photo.id.uuidString.prefix(6))
        let name = [dateSlug, roomSlug, idPrefix].filter { !$0.isEmpty }.joined(separator: "-")
        let url = folder.appending(path: "\(name).jpg")
        try writeAtomically(data: data, to: url)
        return url
    }

    static func removePhoto(for photo: PhotoAttachment, project: Project) {
        removePhoto(id: photo.id, project: project)
    }

    static func removePhoto(id: UUID, project: Project) {
        let folder = projectFolder(project: project).appending(path: "Photos", directoryHint: .isDirectory)
        removeMirroredFiles(under: folder, idPrefix: String(id.uuidString.prefix(6)))
    }

    // MARK: - Documents

    @discardableResult
    static func saveDocument(
        data: Data,
        project: Project,
        document: ProjectDocument
    ) throws -> URL {
        let kindSlug = document.kind.title.safeFolderComponent
        let folder = projectFolder(project: project)
            .appending(path: "Documents", directoryHint: .isDirectory)
            .appending(path: kindSlug.isEmpty ? "Other" : kindSlug, directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
        removeDocument(for: document, project: project)

        let safeName = document.fileName.safeFileNamePreservingExtension
        let idPrefix = String(document.id.uuidString.prefix(6))
        let url = folder.appending(path: safeName.isEmpty ? "\(idPrefix).bin" : safeName.appendingIDPrefix(idPrefix))
        try writeAtomically(data: data, to: url)
        return url
    }

    static func removeDocument(for document: ProjectDocument, project: Project) {
        removeDocument(id: document.id, kind: document.kind, fileName: document.fileName, project: project)
    }

    static func removeDocument(id: UUID, kind: ProjectDocumentKind, fileName: String, project: Project) {
        let folder = projectFolder(project: project).appending(path: "Documents", directoryHint: .isDirectory)
        removeMirroredFiles(under: folder, idPrefix: String(id.uuidString.prefix(6)))

        let kindSlug = kind.title.safeFolderComponent
        let legacyFolder = folder.appending(path: kindSlug.isEmpty ? "Other" : kindSlug, directoryHint: .isDirectory)
        let legacyName = fileName.safeFileNamePreservingExtension
        if !legacyName.isEmpty {
            try? fileManager.removeItem(at: legacyFolder.appending(path: legacyName))
        }
    }

    // MARK: - Cleanup

    /// Remove the entire on-disk folder for a project. Called from PortfolioView.deleteProject.
    static func removeAllMedia(for project: Project) {
        removeAllMedia(at: projectFolder(project: project))
    }

    static func removeAllMedia(at folder: URL) {
        try? fileManager.removeItem(at: folder)
    }

    // MARK: - Atomic write helper

    /// Writes data atomically and translates quota / out-of-space errors into a typed error
    /// so the surrounding UI / health monitor can react. Other write failures rethrow as
    /// `.writeFailed(...)` so the underlying cause is preserved.
    private static func writeAtomically(data: Data, to url: URL) throws {
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            let nsError = error as NSError
            let isOutOfSpace = (nsError.domain == NSCocoaErrorDomain && nsError.code == NSFileWriteOutOfSpaceError)
                || (nsError.domain == NSPOSIXErrorDomain && nsError.code == Int(POSIXError.ENOSPC.rawValue))
            if isOutOfSpace {
                throw MediaStorageError.outOfSpace
            }
            throw MediaStorageError.writeFailed(underlying: error)
        }
    }

    private static func removeMirroredFiles(under folder: URL, idPrefix: String) {
        guard fileManager.fileExists(atPath: folder.path),
              let enumerator = fileManager.enumerator(
                  at: folder,
                  includingPropertiesForKeys: [.isRegularFileKey],
                  options: [.skipsHiddenFiles]
              )
        else {
            return
        }

        for case let url as URL in enumerator {
            let isRegularFile = (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) ?? false
            guard isRegularFile, url.deletingPathExtension().lastPathComponent.hasSuffix(idPrefix) else { continue }
            try? fileManager.removeItem(at: url)
        }
    }
}

// MARK: - Helpers

private extension Date {
    var fileDateString: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC") ?? .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: self)
    }
}

private extension String {
    /// Sanitize a string for use as a single filesystem path component.
    /// Keeps letters, digits, dashes, underscores and spaces; spaces collapse to dashes.
    /// Caps at 120 chars so very long project / vendor / file names don't overflow filesystem
    /// path limits (HFS+/APFS allow longer, but iCloud Drive sync chokes on ~255-byte paths).
    var safeFolderComponent: String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        let allowed = CharacterSet.alphanumerics
            .union(CharacterSet(charactersIn: "-_ "))
        let stripped = trimmed.unicodeScalars
            .map { allowed.contains($0) ? Character($0) : "-" }
        let joined = String(stripped)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return String(joined.prefix(120))
    }

    var safeFileNamePreservingExtension: String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }

        let nsName = trimmed as NSString
        let ext = nsName.pathExtension.safeFolderComponent
        let rawBase = nsName.deletingPathExtension
        let base = rawBase.safeFolderComponent

        if base.isEmpty {
            return ext.isEmpty ? "" : "Document.\(ext)"
        }
        return ext.isEmpty ? base : "\(base).\(ext)"
    }

    func appendingIDPrefix(_ idPrefix: String) -> String {
        let nsName = self as NSString
        let ext = nsName.pathExtension
        let base = nsName.deletingPathExtension
        let taggedBase = [base, idPrefix].filter { !$0.isEmpty }.joined(separator: "-")
        return ext.isEmpty ? taggedBase : "\(taggedBase).\(ext)"
    }
}
