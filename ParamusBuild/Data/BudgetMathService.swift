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
        // Accumulate in integer cents to avoid IEEE 754 drift over many transactions.
        var actualCentsByItemID: [UUID: Int64] = Dictionary(uniqueKeysWithValues: projectItems.map { ($0.id, Int64(0)) })
        var selectionCentsByItemID: [UUID: Int64] = [:]
        var didChange = false

        for selection in allowanceSelections where selection.projectID == projectID {
            selectionCentsByItemID[selection.lineItemID, default: 0] += MoneyMath.cents(selection.amount)
        }

        for expense in expenses where expense.projectID == projectID {
            guard let item = resolveItem(for: expense, in: projectItems) else { continue }
            actualCentsByItemID[item.id, default: 0] += MoneyMath.cents(expense.amount)
        }

        for order in changeOrders where order.projectID == projectID && order.status == .paid {
            guard let item = resolveItem(for: order, in: projectItems) else { continue }
            actualCentsByItemID[item.id, default: 0] += MoneyMath.cents(order.amount)
        }

        for item in projectItems {
            let hasSelections = selectionCentsByItemID[item.id] != nil
            let calculatedCents = item.isAllowance && hasSelections
                ? selectionCentsByItemID[item.id, default: 0]
                : actualCentsByItemID[item.id, default: 0]
            let calculatedActual = MoneyMath.dollars(calculatedCents)
            if MoneyMath.cents(item.actual) != calculatedCents {
                item.actual = calculatedActual
                didChange = true
            }
        }

        return didChange
    }

    /// Total invoiced/incurred against the construction scope.
    static func actualSpend(expenses: [Expense], changeOrders: [ChangeOrder]) -> Double {
        let expenseTotal = MoneyMath.sum(expenses, by: \.amount)
        let paidOrders = MoneyMath.sum(changeOrders.filter { $0.status == .paid }, by: \.amount)
        return MoneyMath.dollars(MoneyMath.cents(expenseTotal) + MoneyMath.cents(paidOrders))
    }

    static func actualSpend(
        items: [BudgetLineItem],
        expenses: [Expense],
        allowanceSelections: [AllowanceSelection],
        changeOrders: [ChangeOrder]
    ) -> Double {
        let allowanceItemIDs = Set(items.filter(\.isAllowance).map(\.id))
        let allowanceItemIDsWithSelections = Set(allowanceSelections.map(\.lineItemID))
        let countedExpenses = expenses.filter { expense in
            guard let itemID = expense.budgetLineItemID,
                  allowanceItemIDs.contains(itemID),
                  allowanceItemIDsWithSelections.contains(itemID)
            else {
                return true
            }
            return false
        }
        let expenseCents = MoneyMath.sum(countedExpenses, by: \.amount)
        let allowanceCents = MoneyMath.sum(
            allowanceSelections.filter { allowanceItemIDs.contains($0.lineItemID) },
            by: \.amount
        )
        let paidOrderCents = MoneyMath.sum(changeOrders.filter { $0.status == .paid }, by: \.amount)
        return MoneyMath.dollars(
            MoneyMath.cents(expenseCents) + MoneyMath.cents(allowanceCents) + MoneyMath.cents(paidOrderCents)
        )
    }

    /// Open commitments + approved-but-not-yet-paid change orders.
    static func committedSpend(items: [BudgetLineItem], changeOrders: [ChangeOrder]) -> Double {
        let openCommitments = MoneyMath.sum(items, by: \.openCommitment)
        let approvedOrders = MoneyMath.sum(changeOrders.filter { $0.status == .approved }, by: \.amount)
        return MoneyMath.dollars(MoneyMath.cents(openCommitments) + MoneyMath.cents(approvedOrders))
    }

    /// Cash actually paid out. Preserved payment-field values are ignored while an
    /// expense is marked unpaid.
    static func cashPaidTotal(expenses: [Expense], changeOrders: [ChangeOrder]) -> Double {
        let paidByExpense = MoneyMath.sum(expenses, by: \.effectiveAmountPaid)
        let paidByOrder = MoneyMath.sum(changeOrders.filter { $0.status == .paid }, by: \.amount)
        return MoneyMath.dollars(MoneyMath.cents(paidByExpense) + MoneyMath.cents(paidByOrder))
    }

    static func pendingExposure(changeOrders: [ChangeOrder]) -> Double {
        MoneyMath.sum(changeOrders.filter { $0.status == .pending }, by: \.amount)
    }

    static func openInvoiceTotal(expenses: [Expense]) -> Double {
        MoneyMath.sum(expenses, by: \.balanceDue)
    }

    static func allowanceSelectionTotal(for item: BudgetLineItem, selections: [AllowanceSelection]) -> Double {
        MoneyMath.sum(
            selections.filter { $0.projectID == item.projectID && $0.lineItemID == item.id },
            by: \.amount
        )
    }

    static func allowanceOverage(
        items: [BudgetLineItem],
        allowanceSelections: [AllowanceSelection],
        expenses: [Expense] = []
    ) -> Double {
        let overageCents: Int64 = items.filter(\.isAllowance).reduce(Int64(0)) { totalCents, item in
            let itemSelections = allowanceSelections.filter { $0.projectID == item.projectID && $0.lineItemID == item.id }
            let actual: Double = itemSelections.isEmpty
                ? MoneyMath.sum(
                    expenses.filter { $0.projectID == item.projectID && $0.budgetLineItemID == item.id },
                    by: \.amount
                )
                : MoneyMath.sum(itemSelections, by: \.amount)
            let itemOverageCents = max(Int64(0), MoneyMath.cents(actual) - MoneyMath.cents(item.allowanceAmount))
            return totalCents + itemOverageCents
        }
        return MoneyMath.dollars(overageCents)
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
