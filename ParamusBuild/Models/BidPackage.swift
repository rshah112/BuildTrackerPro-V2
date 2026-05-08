import Foundation
import SwiftData

enum BidPackageStatus: String, CaseIterable, Identifiable {
    case open
    case awarded
    case passed

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .open: "Open"
        case .awarded: "Awarded"
        case .passed: "Passed"
        }
    }

    var systemImage: String {
        switch self {
        case .open: "tray.full"
        case .awarded: "checkmark.seal"
        case .passed: "nosign"
        }
    }
}

@Model
final class BidPackage {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var scopeTitle: String
    var dueDate: Date?
    var statusRawValue: String
    var awardedBidID: UUID?
    var createdAt: Date
    var notes: String

    init(
        id: UUID = UUID(),
        projectID: UUID,
        scopeTitle: String,
        dueDate: Date? = nil,
        status: BidPackageStatus = .open,
        awardedBidID: UUID? = nil,
        createdAt: Date = .now,
        notes: String = ""
    ) {
        self.id = id
        self.projectID = projectID
        self.scopeTitle = scopeTitle
        self.dueDate = dueDate
        statusRawValue = status.rawValue
        self.awardedBidID = awardedBidID
        self.createdAt = createdAt
        self.notes = notes
    }

    var status: BidPackageStatus {
        get { BidPackageStatus(rawValue: statusRawValue) ?? .open }
        set { statusRawValue = newValue.rawValue }
    }
}
