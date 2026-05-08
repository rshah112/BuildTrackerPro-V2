import Foundation
import SwiftData

enum ProjectTaskStatus: String, CaseIterable, Identifiable {
    case todo
    case inProgress
    case blocked
    case done

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .todo: "To Do"
        case .inProgress: "In Progress"
        case .blocked: "Blocked"
        case .done: "Done"
        }
    }

    var systemImage: String {
        switch self {
        case .todo: "circle"
        case .inProgress: "clock"
        case .blocked: "exclamationmark.octagon"
        case .done: "checkmark.circle.fill"
        }
    }
}

@Model
final class ProjectTask {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var title: String
    var statusRawValue: String
    var dueDate: Date?
    var vendorID: UUID?
    var budgetLineItemID: UUID?
    var photoIDs: [UUID]
    var notes: String
    var createdAt: Date
    var completedAt: Date?

    init(
        id: UUID = UUID(),
        projectID: UUID,
        title: String,
        status: ProjectTaskStatus = .todo,
        dueDate: Date? = nil,
        vendorID: UUID? = nil,
        budgetLineItemID: UUID? = nil,
        photoIDs: [UUID] = [],
        notes: String = "",
        createdAt: Date = .now,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.projectID = projectID
        self.title = title
        statusRawValue = status.rawValue
        self.dueDate = dueDate
        self.vendorID = vendorID
        self.budgetLineItemID = budgetLineItemID
        self.photoIDs = photoIDs
        self.notes = notes
        self.createdAt = createdAt
        self.completedAt = completedAt
    }

    var status: ProjectTaskStatus {
        get { ProjectTaskStatus(rawValue: statusRawValue) ?? .todo }
        set {
            statusRawValue = newValue.rawValue
            completedAt = newValue == .done ? completedAt ?? .now : nil
        }
    }

    var isComplete: Bool {
        status == .done
    }

    var isOverdue: Bool {
        guard let dueDate, !isComplete else { return false }
        return Calendar.current.startOfDay(for: dueDate) < Calendar.current.startOfDay(for: .now)
    }
}
