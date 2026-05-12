import Foundation
import SwiftUI

/// Single source of truth for "is the user's data at risk right now?" signals.
/// Refreshed on launch and after each backup. Read by PortfolioView (banner) and
/// SettingsView (Data Safety section).
@MainActor
final class StorageHealthMonitor: ObservableObject {
    static let shared = StorageHealthMonitor()

    /// Bytes available on the volume backing the app sandbox. nil if unknown.
    @Published private(set) var availableBytes: Int64?

    /// Whether the iCloud Drive ubiquity container is reachable for this app.
    /// nil while the check is in flight, true/false once resolved.
    @Published private(set) var iCloudAvailable: Bool?

    /// Newest backup's timestamp (across local + iCloud), nil if none have run.
    @Published private(set) var lastBackupDate: Date?

    /// Set when a media-mirror write fails. Surfaces a banner; cleared on next successful refresh.
    @Published private(set) var mirrorFailureMessage: String?

    private init() {}

    /// Raj's iPhone has ~50–200GB typically — anything under 200MB free is "low".
    var isDiskLow: Bool {
        guard let availableBytes else { return false }
        return availableBytes < 200 * 1024 * 1024
    }

    var isBackupStale: Bool {
        guard let lastBackupDate else { return true }
        return Date().timeIntervalSince(lastBackupDate) > 7 * 24 * 60 * 60
    }

    /// True if anything user-visible is worth surfacing on the portfolio.
    var hasWarning: Bool {
        isDiskLow || isBackupStale || mirrorFailureMessage != nil || iCloudAvailable == false
    }

    var bannerMessage: String? {
        if let mirrorFailureMessage {
            return mirrorFailureMessage
        }
        if isDiskLow {
            return "Storage low on this iPhone. Free space or your next photo / receipt may not save."
        }
        if isBackupStale {
            return "No recent backup. Open Settings → Data Safety to back up now."
        }
        if iCloudAvailable == false {
            return "iCloud Drive unavailable. Backups are local-only until you sign in to iCloud."
        }
        return nil
    }

    func refresh() {
        availableBytes = Self.currentAvailableBytes()
        iCloudAvailable = Self.iCloudReachable()
        lastBackupDate = BackupService.lastBackupDate()
        if mirrorFailureMessage != nil && !isDiskLow {
            mirrorFailureMessage = nil
        }
    }

    func reportBackupSucceeded(at date: Date = .now) {
        lastBackupDate = date
    }

    func reportMirrorFailure(_ error: Error) {
        if case MediaStorageError.outOfSpace = error {
            mirrorFailureMessage = "iPhone storage full. The latest photo / receipt didn't write to the file mirror — back up to iCloud and free space."
        } else {
            mirrorFailureMessage = "A photo or document couldn't be mirrored to the Files.app folder. The data IS still saved inside the app."
        }
    }

    private static func currentAvailableBytes() -> Int64? {
        let url = MediaStorageService.documentsRoot
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return values?.volumeAvailableCapacityForImportantUsage
    }

    private static func iCloudReachable() -> Bool {
        FileManager.default.url(forUbiquityContainerIdentifier: nil) != nil
    }
}
