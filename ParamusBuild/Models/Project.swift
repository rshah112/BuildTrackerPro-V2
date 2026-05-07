import Foundation
import SwiftData

enum ProjectStatus: String, CaseIterable, Identifiable {
    case planning
    case active
    case paused
    case complete

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .planning: "Planning"
        case .active: "Active"
        case .paused: "Paused"
        case .complete: "Complete"
        }
    }

    var systemImage: String {
        switch self {
        case .planning: "pencil.and.list.clipboard"
        case .active: "hammer"
        case .paused: "pause.circle"
        case .complete: "checkmark.seal"
        }
    }
}

enum ProjectPriority: String, CaseIterable, Identifiable {
    case low
    case normal
    case high
    case urgent

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .low: "Low"
        case .normal: "Normal"
        case .high: "High"
        case .urgent: "Urgent"
        }
    }
}

@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var name: String
    var address: String
    var statusRawValue: String = ProjectStatus.planning.rawValue
    var priorityRawValue: String = ProjectPriority.normal.rawValue
    var purchasePrice: Double = 0
    var lotDimensions: String = ""
    var proposedBuildDimensions: String = ""
    var footprint: String
    var stories: Int
    var basement: String
    var scopeSummary: String = ""
    var warrantyNotes: String = ""
    var startDate: Date?
    var targetFinishDate: Date?
    var constructionBudget: Double
    var contingencyBudget: Double
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        address: String,
        status: ProjectStatus = .planning,
        priority: ProjectPriority = .normal,
        purchasePrice: Double = 0,
        lotDimensions: String = "",
        proposedBuildDimensions: String = "",
        footprint: String,
        stories: Int,
        basement: String,
        scopeSummary: String = "",
        warrantyNotes: String = "",
        startDate: Date? = nil,
        targetFinishDate: Date? = nil,
        constructionBudget: Double,
        contingencyBudget: Double,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.address = address
        statusRawValue = status.rawValue
        priorityRawValue = priority.rawValue
        self.purchasePrice = purchasePrice
        self.lotDimensions = lotDimensions
        self.proposedBuildDimensions = proposedBuildDimensions
        self.footprint = footprint
        self.stories = stories
        self.basement = basement
        self.scopeSummary = scopeSummary
        self.warrantyNotes = warrantyNotes
        self.startDate = startDate
        self.targetFinishDate = targetFinishDate
        self.constructionBudget = constructionBudget
        self.contingencyBudget = contingencyBudget
        self.createdAt = createdAt
    }

    var status: ProjectStatus {
        get { ProjectStatus(rawValue: statusRawValue) ?? .planning }
        set { statusRawValue = newValue.rawValue }
    }

    var priority: ProjectPriority {
        get { ProjectPriority(rawValue: priorityRawValue) ?? .normal }
        set { priorityRawValue = newValue.rawValue }
    }
}
