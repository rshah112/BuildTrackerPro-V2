import Foundation
import SwiftData
import UIKit

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

    Why a separate folder hierarchy:
      - The app's internal database (SwiftData) is the source of truth in-app, but
        it's an opaque sqlite file. This folder is the human-readable mirror.
      - Files here can be backed up to iCloud Drive by dragging the HomeBuild Pro
        folder elsewhere in Files.app, or downloaded to a computer.
      - On reinstall after deletion, files in the iOS app sandbox are also deleted.
        Back up this folder BEFORE deleting the app if you want manual recovery.
    """

    // MARK: - Receipts (expenses)

    @discardableResult
    static func saveReceipt(
        data: Data,
        project: Project,
        expense: Expense
    ) -> URL? {
        let folder = projectFolder(project: project).appending(path: "Receipts", directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)

        let dateSlug = expense.date.fileDateString
        let vendorSlug = expense.vendorName.safeFolderComponent
        let idPrefix = String(expense.id.uuidString.prefix(6))
        let name = [dateSlug, vendorSlug, idPrefix].filter { !$0.isEmpty }.joined(separator: "-")
        let url = folder.appending(path: "\(name).jpg")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
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

    // MARK: - Photos

    @discardableResult
    static func savePhoto(
        data: Data,
        project: Project,
        photo: PhotoAttachment
    ) -> URL? {
        let folderName = photo.phaseTag.safeFolderComponent
        let folder = projectFolder(project: project)
            .appending(path: "Photos", directoryHint: .isDirectory)
            .appending(path: folderName.isEmpty ? "Uncategorized" : folderName, directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)

        let dateSlug = photo.createdAt.fileDateString
        let roomSlug = photo.roomTag.safeFolderComponent
        let idPrefix = String(photo.id.uuidString.prefix(6))
        let name = [dateSlug, roomSlug, idPrefix].filter { !$0.isEmpty }.joined(separator: "-")
        let url = folder.appending(path: "\(name).jpg")
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    // MARK: - Documents

    @discardableResult
    static func saveDocument(
        data: Data,
        project: Project,
        document: ProjectDocument
    ) -> URL? {
        let kindSlug = document.kind.title.safeFolderComponent
        let folder = projectFolder(project: project)
            .appending(path: "Documents", directoryHint: .isDirectory)
            .appending(path: kindSlug.isEmpty ? "Other" : kindSlug, directoryHint: .isDirectory)
        try? fileManager.createDirectory(at: folder, withIntermediateDirectories: true)

        let safeName = document.fileName.safeFolderComponent
        let url = folder.appending(path: safeName.isEmpty ? "\(document.id.uuidString).bin" : safeName)
        do {
            try data.write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }

    // MARK: - Cleanup

    /// Remove the entire on-disk folder for a project. Called from PortfolioView.deleteProject.
    static func removeAllMedia(for project: Project) {
        let folder = projectFolder(project: project)
        try? fileManager.removeItem(at: folder)
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
    var safeFolderComponent: String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "" }
        let allowed = CharacterSet.alphanumerics
            .union(CharacterSet(charactersIn: "-_ "))
        let stripped = trimmed.unicodeScalars
            .map { allowed.contains($0) ? Character($0) : "-" }
        let joined = String(stripped)
        return joined
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
    }
}
