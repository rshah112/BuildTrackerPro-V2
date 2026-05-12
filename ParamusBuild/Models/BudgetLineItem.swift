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
    var roomTag: String = ""
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
        roomTag: String = "",
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
        self.roomTag = roomTag
        self.budget = budget
        self.actual = actual
        self.committed = committed
        self.notes = notes
        self.isPinned = isPinned
        self.isAllowance = isAllowance
        self.allowanceAmount = allowanceAmount ?? (isAllowance ? budget : 0)
        self.createdAt = createdAt
    }

    // All computed money values pass through MoneyMath so comparisons (variance > 0,
    // utilization >= 0.9, etc.) operate on cent-exact dollars, not IEEE 754 drift.

    var spentAndCommitted: Double {
        MoneyMath.dollars(MoneyMath.cents(actual) + MoneyMath.cents(openCommitment))
    }

    var openCommitment: Double {
        guard !isAllowance else { return 0 }
        let diffCents = MoneyMath.cents(committed) - MoneyMath.cents(actual)
        return MoneyMath.dollars(max(Int64(0), diffCents))
    }

    var remaining: Double {
        if isAllowance {
            return MoneyMath.diff(allowanceAmount, actual)
        }
        return MoneyMath.diff(budget, spentAndCommitted)
    }

    var variance: Double {
        if isAllowance {
            let diffCents = MoneyMath.cents(actual) - MoneyMath.cents(allowanceAmount)
            return MoneyMath.dollars(max(Int64(0), diffCents))
        }
        return MoneyMath.diff(spentAndCommitted, budget)
    }

    var utilization: Double {
        let limit = isAllowance ? allowanceAmount : budget
        guard limit > 0 else { return 0 }
        return spentAndCommitted / limit
    }

    var health: BudgetHealth {
        // Compare in integer cents so an invisible 0.0000001 drift can't flip the bucket.
        if MoneyMath.cents(variance) > 0 {
            return .overBudget
        }

        if utilization >= 0.9 {
            return .nearLimit
        }

        return .healthy
    }
}
