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
    var isAllowance: Bool = false
    var allowanceAmount: Double = 0
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
        isAllowance: Bool = false,
        allowanceAmount: Double? = nil,
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
        self.isAllowance = isAllowance
        self.allowanceAmount = allowanceAmount ?? (isAllowance ? budget : 0)
        self.createdAt = createdAt
    }

    var spentAndCommitted: Double {
        actual + openCommitment
    }

    var openCommitment: Double {
        isAllowance ? 0 : max(0, committed - actual)
    }

    var remaining: Double {
        if isAllowance {
            return allowanceAmount - actual
        }
        return budget - spentAndCommitted
    }

    var variance: Double {
        if isAllowance {
            return max(0, actual - allowanceAmount)
        }
        return spentAndCommitted - budget
    }

    var utilization: Double {
        let limit = isAllowance ? allowanceAmount : budget
        guard limit > 0 else { return 0 }
        return spentAndCommitted / limit
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
