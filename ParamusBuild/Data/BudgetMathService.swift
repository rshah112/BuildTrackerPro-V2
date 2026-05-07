import Foundation

/// Money model:
/// - Expenses are the single source of truth for cash actually invoiced/paid.
/// - Change orders represent contractual changes; their statuses (pending → approved → paid)
///   express commitment workflow. Paid COs DO NOT add a second copy of money to actuals;
///   the user records an Expense when cash actually moves. This avoids double counting.
enum BudgetMathService {
    @discardableResult
    static func recalculateActuals(
        for projectID: UUID,
        items: [BudgetLineItem],
        expenses: [Expense],
        changeOrders: [ChangeOrder]
    ) -> Bool {
        let projectItems = items.filter { $0.projectID == projectID }
        var actualByItemID: [UUID: Double] = Dictionary(uniqueKeysWithValues: projectItems.map { ($0.id, 0) })
        var didChange = false

        for expense in expenses where expense.projectID == projectID {
            guard let item = resolveItem(for: expense, in: projectItems) else { continue }
            actualByItemID[item.id, default: 0] += expense.amount
        }

        for item in projectItems {
            let calculatedActual = actualByItemID[item.id, default: 0]
            if item.actual != calculatedActual {
                item.actual = calculatedActual
                didChange = true
            }
        }

        return didChange
    }

    /// Total invoiced/incurred against the construction scope. Paid COs are excluded
    /// because the user logs an Expense when cash moves.
    static func actualSpend(expenses: [Expense], changeOrders: [ChangeOrder]) -> Double {
        expenses.reduce(0) { $0 + $1.amount }
    }

    /// Open commitments + approved-but-not-yet-paid change orders.
    static func committedSpend(items: [BudgetLineItem], changeOrders: [ChangeOrder]) -> Double {
        items.reduce(0) { $0 + $1.openCommitment }
            + changeOrders.filter { $0.status == .approved }.reduce(0) { $0 + $1.amount }
    }

    /// Cash actually paid out — sum of expense.amountPaid (clamped between 0 and amount).
    static func cashPaidTotal(expenses: [Expense], changeOrders: [ChangeOrder]) -> Double {
        expenses.reduce(0) { $0 + min($1.amount, max(0, $1.amountPaid)) }
    }

    static func pendingExposure(changeOrders: [ChangeOrder]) -> Double {
        changeOrders.filter { $0.status == .pending }.reduce(0) { $0 + $1.amount }
    }

    static func openInvoiceTotal(expenses: [Expense]) -> Double {
        expenses.reduce(0) { $0 + $1.balanceDue }
    }

    private static func resolveItem(for expense: Expense, in items: [BudgetLineItem]) -> BudgetLineItem? {
        if let itemID = expense.budgetLineItemID,
           let item = items.first(where: { $0.id == itemID })
        {
            return item
        }

        if !expense.budgetLineItemTitle.trimmed.isEmpty,
           let item = items
           .first(where: { matches($0.title, expense.budgetLineItemTitle) && matches($0.categoryName, expense.categoryName) })
        {
            return item
        }

        return nil
    }

    private static func matches(_ left: String, _ right: String) -> Bool {
        left.trimmed.caseInsensitiveCompare(right.trimmed) == .orderedSame
    }
}
