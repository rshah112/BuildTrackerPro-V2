import Foundation
import SwiftData

enum BudgetHealth {
    case healthy
    case nearLimit
    case overBudget
}

@Model
final class BudgetLineItem {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var costCode: String
    var title: String
    var categoryName: String
    var budget: Double
    var actual: Double
    var committed: Double
    var notes: String
    var isPinned: Bool
    var createdAt: Date

    init(
        id: UUID = UUID(),
        projectID: UUID,
        costCode: String,
        title: String,
        categoryName: String,
        budget: Double,
        actual: Double = 0,
        committed: Double = 0,
        notes: String = "",
        isPinned: Bool = false,
        createdAt: Date = .now
    ) {
        self.id = id
        self.projectID = projectID
        self.costCode = costCode
        self.title = title
        self.categoryName = categoryName
        self.budget = budget
        self.actual = actual
        self.committed = committed
        self.notes = notes
        self.isPinned = isPinned
        self.createdAt = createdAt
    }

    var spentAndCommitted: Double {
        actual + openCommitment
    }

    var openCommitment: Double {
        max(0, committed - actual)
    }

    var remaining: Double {
        budget - spentAndCommitted
    }

    var variance: Double {
        spentAndCommitted - budget
    }

    var utilization: Double {
        guard budget > 0 else { return 0 }
        return spentAndCommitted / budget
    }

    var health: BudgetHealth {
        if variance > 0 {
            return .overBudget
        }

        if utilization >= 0.9 {
            return .nearLimit
        }

        return .healthy
    }
}
