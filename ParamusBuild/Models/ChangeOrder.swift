import Foundation
import SwiftData

enum ChangeOrderStatus: String, CaseIterable, Identifiable {
    case pending
    case approved
    case paid

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .pending: "Pending"
        case .approved: "Approved"
        case .paid: "Paid"
        }
    }
}

@Model
final class ChangeOrder {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var title: String
    var amount: Double
    var statusRawValue: String
    var notes: String
    var categoryName: String
    var budgetLineItemID: UUID?
    var budgetLineItemTitle: String
    var createdAt: Date

    init(
        id: UUID = UUID(),
        projectID: UUID,
        title: String,
        amount: Double,
        status: ChangeOrderStatus,
        notes: String = "",
        categoryName: String,
        budgetLineItemID: UUID? = nil,
        budgetLineItemTitle: String = "",
        createdAt: Date = .now
    ) {
        self.id = id
        self.projectID = projectID
        self.title = title
        self.amount = amount
        statusRawValue = status.rawValue
        self.notes = notes
        self.categoryName = categoryName
        self.budgetLineItemID = budgetLineItemID
        self.budgetLineItemTitle = budgetLineItemTitle
        self.createdAt = createdAt
    }

    var status: ChangeOrderStatus {
        get { ChangeOrderStatus(rawValue: statusRawValue) ?? .pending }
        set { statusRawValue = newValue.rawValue }
    }
}
