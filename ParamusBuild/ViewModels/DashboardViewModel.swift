import Foundation

struct DashboardViewModel {
    let project: Project?
    let items: [BudgetLineItem]
    let expenses: [Expense]
    let photos: [PhotoAttachment]
    let changeOrders: [ChangeOrder]
    let allowanceSelections: [AllowanceSelection]
    let tasks: [ProjectTask]

    private var constructionItems: [BudgetLineItem] {
        items.filter { !Self.isContingency($0.categoryName) }
    }

    private var constructionExpenses: [Expense] {
        expenses.filter { !Self.isContingency($0.categoryName) }
    }

    private var constructionChangeOrders: [ChangeOrder] {
        changeOrders.filter { !Self.isContingency($0.categoryName) }
    }

    private var constructionAllowanceSelections: [AllowanceSelection] {
        let constructionItemIDs = Set(constructionItems.map(\.id))
        return allowanceSelections.filter { constructionItemIDs.contains($0.lineItemID) }
    }

    var totalBudget: Double {
        if let projectBudget = project?.constructionBudget {
            return projectBudget.roundedToCents
        }
        return MoneyMath.sum(constructionItems, by: \.budget)
    }

    var actualSpent: Double {
        BudgetMathService.actualSpend(
            items: constructionItems,
            expenses: constructionExpenses,
            allowanceSelections: constructionAllowanceSelections,
            changeOrders: constructionChangeOrders
        )
    }

    var cashPaid: Double {
        BudgetMathService.cashPaidTotal(expenses: constructionExpenses, changeOrders: constructionChangeOrders)
    }

    var committedSpend: Double {
        BudgetMathService.committedSpend(items: constructionItems, changeOrders: constructionChangeOrders)
    }

    var openInvoiceTotal: Double {
        BudgetMathService.openInvoiceTotal(expenses: constructionExpenses)
    }

    var allowanceOverage: Double {
        BudgetMathService.allowanceOverage(
            items: constructionItems,
            allowanceSelections: constructionAllowanceSelections,
            expenses: constructionExpenses
        )
    }

    var remainingBudget: Double {
        MoneyMath.dollars(MoneyMath.cents(totalBudget) - MoneyMath.cents(actualSpent) - MoneyMath.cents(committedSpend))
    }

    var contingencyRemaining: Double {
        let contingencyBudgetCents = MoneyMath.cents(project?.contingencyBudget ?? 0)
        let contingencyItemSpend = MoneyMath.sum(
            items.filter { Self.isContingency($0.categoryName) },
            by: \.spentAndCommitted
        )
        let pendingContingency = MoneyMath.sum(
            changeOrders.filter { $0.status == .pending && Self.isContingency($0.categoryName) },
            by: \.amount
        )
        return MoneyMath.dollars(
            contingencyBudgetCents - MoneyMath.cents(contingencyItemSpend) - MoneyMath.cents(pendingContingency)
        )
    }

    var budgetProgress: Double {
        guard totalBudget > 0 else { return 0 }
        return (actualSpent + committedSpend) / totalBudget
    }

    var recentExpenses: [Expense] {
        Array(expenses.prefix(4))
    }

    var recentPhotos: [PhotoAttachment] {
        Array(photos.prefix(4))
    }

    var overBudgetItems: [BudgetLineItem] {
        constructionItems
            .filter { $0.health == .overBudget }
            .sorted { $0.variance > $1.variance }
    }

    var pinnedItems: [BudgetLineItem] {
        constructionItems
            .filter(\.isPinned)
            .sorted { $0.utilization > $1.utilization }
    }

    var openChangeOrderTotal: Double {
        MoneyMath.sum(changeOrders.filter { $0.status != .paid }, by: \.amount)
    }

    var pendingExposure: Double {
        BudgetMathService.pendingExposure(changeOrders: constructionChangeOrders)
    }

    var overdueTasks: [ProjectTask] {
        tasks.filter(\.isOverdue)
    }

    var unassignedExpenses: [Expense] {
        expenses.filter {
            $0.budgetLineItemID == nil ||
                $0.budgetLineItemTitle.trimmed.isEmpty ||
                $0.categoryName.trimmed.caseInsensitiveCompare("Unassigned") == .orderedSame
        }
    }

    var upcomingPayments: [Expense] {
        constructionExpenses
            .filter { $0.balanceDue > 0 }
            .sorted { ($0.dueDate ?? $0.date) < ($1.dueDate ?? $1.date) }
    }

    var categorySummaries: [BudgetCategorySummary] {
        let grouped = Dictionary(grouping: constructionItems, by: \.categoryName)
        return grouped.map { category, items in
            let approvedChanges = MoneyMath.sum(
                constructionChangeOrders.filter {
                    $0.status == .approved && $0.categoryName.trimmed.caseInsensitiveCompare(category.trimmed) == .orderedSame
                },
                by: \.amount
            )
            let openCommitments = MoneyMath.sum(items, by: \.openCommitment)
            return BudgetCategorySummary(
                name: category,
                budget: MoneyMath.sum(items, by: \.budget),
                actual: MoneyMath.sum(items, by: \.actual),
                committed: MoneyMath.dollars(MoneyMath.cents(openCommitments) + MoneyMath.cents(approvedChanges))
            )
        }
        .sorted { $0.utilization > $1.utilization }
    }

    var phaseSummaries: [BudgetPhaseSummary] {
        let grouped = Dictionary(grouping: constructionItems) { item in
            BudgetPhaseSummary.phase(for: item.categoryName)
        }

        return BudgetPhaseSummary.phaseOrder.compactMap { phase in
            guard let phaseItems = grouped[phase], !phaseItems.isEmpty else { return nil }
            let phaseCategories = Set(phaseItems.map(\.categoryName))
            let approvedChanges = MoneyMath.sum(
                constructionChangeOrders.filter { order in
                    order.status == .approved && phaseCategories
                        .contains { $0.trimmed.caseInsensitiveCompare(order.categoryName.trimmed) == .orderedSame }
                },
                by: \.amount
            )
            let openCommitments = MoneyMath.sum(phaseItems, by: \.openCommitment)
            return BudgetPhaseSummary(
                name: phase,
                budget: MoneyMath.sum(phaseItems, by: \.budget),
                actual: MoneyMath.sum(phaseItems, by: \.actual),
                committed: MoneyMath.dollars(MoneyMath.cents(openCommitments) + MoneyMath.cents(approvedChanges))
            )
        }
    }

    private static func isContingency(_ categoryName: String) -> Bool {
        categoryName.trimmed.caseInsensitiveCompare("Contingency") == .orderedSame
    }
}

struct BudgetCategorySummary: Identifiable {
    var id: String {
        name
    }

    let name: String
    let budget: Double
    let actual: Double
    let committed: Double

    private var spentAndCommittedCents: Int64 {
        MoneyMath.cents(actual) + MoneyMath.cents(committed)
    }

    var utilization: Double {
        guard budget > 0 else { return 0 }
        return MoneyMath.dollars(spentAndCommittedCents) / budget
    }

    var health: BudgetHealth {
        if spentAndCommittedCents > MoneyMath.cents(budget) { return .overBudget }
        if utilization >= 0.9 { return .nearLimit }
        return .healthy
    }
}

struct BudgetPhaseSummary: Identifiable {
    static let phaseOrder = [
        "Demo",
        "Soft Costs",
        "Site",
        "Foundation",
        "Frame",
        "Exterior",
        "Systems",
        "Pool",
        "Hardscape",
        "Deck",
        "Interior",
        "Garage",
        "Landscaping",
        "Final",
        "Contingency"
    ]

    var id: String {
        name
    }

    let name: String
    let budget: Double
    let actual: Double
    let committed: Double

    private var spentAndCommittedCents: Int64 {
        MoneyMath.cents(actual) + MoneyMath.cents(committed)
    }

    var utilization: Double {
        guard budget > 0 else { return 0 }
        return MoneyMath.dollars(spentAndCommittedCents) / budget
    }

    var remaining: Double {
        MoneyMath.dollars(MoneyMath.cents(budget) - spentAndCommittedCents)
    }

    var health: BudgetHealth {
        if spentAndCommittedCents > MoneyMath.cents(budget) { return .overBudget }
        if utilization >= 0.9 { return .nearLimit }
        return .healthy
    }

    static func phase(for categoryName: String) -> String {
        let name = categoryName.localizedLowercase

        if name.contains("demo") { return "Demo" }
        if name.contains("soft") || name.contains("pre construction") { return "Soft Costs" }
        if name.contains("site") || name.contains("general conditions") || name.contains("utilities") || name
            .contains("excavation") { return "Site" }
        if name.contains("foundation") || name.contains("concrete") || name.contains("masonry") { return "Foundation" }
        if name.contains("framing") || name.contains("structural") { return "Frame" }
        if name.contains("exterior") || name.contains("roof") || name.contains("window") { return "Exterior" }
        if name.contains("plumbing") || name.contains("hvac") || name.contains("electrical") || name
            .contains("low voltage") { return "Systems" }
        if name.contains("pool") || name.contains("shell") || name.contains("equipment") { return "Pool" }
        if name.contains("hardscape") || name.contains("patio") || name.contains("paver") || name.contains("coping") { return "Hardscape" }
        if name.contains("deck") || name.contains("railing") || name.contains("stairs") { return "Deck" }
        if name.contains("garage") { return "Garage" }
        if name.contains("landscap") || name.contains("planting") { return "Landscaping" }
        if name.contains("driveway") || name.contains("cleanup") || name.contains("closeout") || name.contains("final") { return "Final" }
        if name.contains("contingency") { return "Contingency" }
        return "Interior"
    }
}
