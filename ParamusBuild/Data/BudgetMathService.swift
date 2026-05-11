import Foundation

/// Money model:
/// - Expenses are the single source of truth for cash actually invoiced/paid.
/// - Allowance selections are the single source of truth for allowance-line actuals.
/// - Change orders represent contractual changes; their statuses (pending -> approved -> paid)
///   express commitment workflow. Paid COs count as actual/cash paid unless the user
///   keeps the CO approved and records cash through an Expense instead.
enum BudgetMathService {
    @discardableResult
    static func recalculateActuals(
        for projectID: UUID,
        items: [BudgetLineItem],
        expenses: [Expense],
        changeOrders: [ChangeOrder],
        allowanceSelections: [AllowanceSelection]
    ) -> Bool {
        let projectItems = items.filter { $0.projectID == projectID }
        var actualByItemID: [UUID: Double] = Dictionary(uniqueKeysWithValues: projectItems.map { ($0.id, 0) })
        var selectionActualByItemID: [UUID: Double] = [:]
        var didChange = false

        for selection in allowanceSelections where selection.projectID == projectID {
            selectionActualByItemID[selection.lineItemID, default: 0] += selection.amount
        }

        for expense in expenses where expense.projectID == projectID {
            guard let item = resolveItem(for: expense, in: projectItems) else { continue }
            actualByItemID[item.id, default: 0] += expense.amount
        }

        for order in changeOrders where order.projectID == projectID && order.status == .paid {
            guard let item = resolveItem(for: order, in: projectItems) else { continue }
            actualByItemID[item.id, default: 0] += order.amount
        }

        for item in projectItems {
            let hasSelections = selectionActualByItemID[item.id] != nil
            let calculatedActual = item.isAllowance && hasSelections
                ? selectionActualByItemID[item.id, default: 0]
                : actualByItemID[item.id, default: 0]
            if item.actual != calculatedActual {
                item.actual = calculatedActual
                didChange = true
            }
        }

        return didChange
    }

    /// Total invoiced/incurred against the construction scope.
    static func actualSpend(expenses: [Expense], changeOrders: [ChangeOrder]) -> Double {
        expenses.reduce(0) { $0 + $1.amount }
            + changeOrders.filter { $0.status == .paid }.reduce(0) { $0 + $1.amount }
    }

    static func actualSpend(
        items: [BudgetLineItem],
        expenses: [Expense],
        allowanceSelections: [AllowanceSelection],
        changeOrders: [ChangeOrder]
    ) -> Double {
        let allowanceItemIDs = Set(items.filter(\.isAllowance).map(\.id))
        let allowanceItemIDsWithSelections = Set(allowanceSelections.map(\.lineItemID))
        let expenseTotal = expenses.reduce(0) { total, expense in
            if let itemID = expense.budgetLineItemID,
               allowanceItemIDs.contains(itemID),
               allowanceItemIDsWithSelections.contains(itemID)
            {
                return total
            }
            return total + expense.amount
        }
        let allowanceActuals = allowanceSelections.reduce(0) { total, selection in
            allowanceItemIDs.contains(selection.lineItemID) ? total + selection.amount : total
        }
        let paidChangeOrders = changeOrders.filter { $0.status == .paid }.reduce(0) { $0 + $1.amount }
        return expenseTotal + allowanceActuals + paidChangeOrders
    }

    /// Open commitments + approved-but-not-yet-paid change orders.
    static func committedSpend(items: [BudgetLineItem], changeOrders: [ChangeOrder]) -> Double {
        items.reduce(0) { $0 + $1.openCommitment }
            + changeOrders.filter { $0.status == .approved }.reduce(0) { $0 + $1.amount }
    }

    /// Cash actually paid out. Preserved payment-field values are ignored while an
    /// expense is marked unpaid.
    static func cashPaidTotal(expenses: [Expense], changeOrders: [ChangeOrder]) -> Double {
        expenses.reduce(0) { $0 + $1.effectiveAmountPaid }
            + changeOrders.filter { $0.status == .paid }.reduce(0) { $0 + $1.amount }
    }

    static func pendingExposure(changeOrders: [ChangeOrder]) -> Double {
        changeOrders.filter { $0.status == .pending }.reduce(0) { $0 + $1.amount }
    }

    static func openInvoiceTotal(expenses: [Expense]) -> Double {
        expenses.reduce(0) { $0 + $1.balanceDue }
    }

    static func allowanceSelectionTotal(for item: BudgetLineItem, selections: [AllowanceSelection]) -> Double {
        selections
            .filter { $0.projectID == item.projectID && $0.lineItemID == item.id }
            .reduce(0) { $0 + $1.amount }
    }

    static func allowanceOverage(
        items: [BudgetLineItem],
        allowanceSelections: [AllowanceSelection],
        expenses: [Expense] = []
    ) -> Double {
        items.filter(\.isAllowance).reduce(0) { total, item in
            let itemSelections = allowanceSelections.filter { $0.projectID == item.projectID && $0.lineItemID == item.id }
            let actual = itemSelections.isEmpty
                ? expenses.filter { $0.projectID == item.projectID && $0.budgetLineItemID == item.id }.reduce(0) { $0 + $1.amount }
                : itemSelections.reduce(0) { $0 + $1.amount }
            return total + max(0, actual - item.allowanceAmount)
        }
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

    private static func resolveItem(for order: ChangeOrder, in items: [BudgetLineItem]) -> BudgetLineItem? {
        if let itemID = order.budgetLineItemID,
           let item = items.first(where: { $0.id == itemID })
        {
            return item
        }

        if !order.budgetLineItemTitle.trimmed.isEmpty,
           let item = items
           .first(where: { matches($0.title, order.budgetLineItemTitle) && matches($0.categoryName, order.categoryName) })
        {
            return item
        }

        return nil
    }

    private static func matches(_ left: String, _ right: String) -> Bool {
        left.trimmed.caseInsensitiveCompare(right.trimmed) == .orderedSame
    }
}
