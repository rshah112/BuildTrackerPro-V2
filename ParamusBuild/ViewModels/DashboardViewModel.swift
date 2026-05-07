import Foundation

struct DashboardViewModel {
    let project: Project?
    let items: [BudgetLineItem]
    let expenses: [Expense]
    let photos: [PhotoAttachment]
    let changeOrders: [ChangeOrder]

    private var constructionItems: [BudgetLineItem] {
        items.filter { !Self.isContingency($0.categoryName) }
    }

    private var constructionExpenses: [Expense] {
        expenses.filter { !Self.isContingency($0.categoryName) }
    }

    private var constructionChangeOrders: [ChangeOrder] {
        changeOrders.filter { !Self.isContingency($0.categoryName) }
    }

    var totalBudget: Double {
        project?.constructionBudget ?? constructionItems.reduce(0) { $0 + $1.budget }
    }

    var actualSpent: Double {
        BudgetMathService.actualSpend(expenses: constructionExpenses, changeOrders: constructionChangeOrders)
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

    var remainingBudget: Double {
        totalBudget - actualSpent - committedSpend
    }

    var contingencyRemaining: Double {
        let contingencyBudget = project?.contingencyBudget ?? 0
        let contingencyItemSpend = items
            .filter { Self.isContingency($0.categoryName) }
            .reduce(0) { $0 + $1.spentAndCommitted }
        let pendingContingency = changeOrders
            .filter { $0.status == .pending && Self.isContingency($0.categoryName) }
            .reduce(0) { $0 + $1.amount }
        return contingencyBudget - contingencyItemSpend - pendingContingency
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
        changeOrders
            .filter { $0.status != .paid }
            .reduce(0) { $0 + $1.amount }
    }

    var pendingExposure: Double {
        BudgetMathService.pendingExposure(changeOrders: constructionChangeOrders)
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
            let approvedChanges = constructionChangeOrders
                .filter { $0.status == .approved && $0.categoryName.trimmed.caseInsensitiveCompare(category.trimmed) == .orderedSame }
                .reduce(0) { $0 + $1.amount }
            return BudgetCategorySummary(
                name: category,
                budget: items.reduce(0) { $0 + $1.budget },
                actual: items.reduce(0) { $0 + $1.actual },
                committed: items.reduce(0) { $0 + $1.openCommitment } + approvedChanges
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
            let approvedChanges = constructionChangeOrders
                .filter { order in
                    order.status == .approved && phaseCategories
                        .contains { $0.trimmed.caseInsensitiveCompare(order.categoryName.trimmed) == .orderedSame }
                }
                .reduce(0) { $0 + $1.amount }
            return BudgetPhaseSummary(
                name: phase,
                budget: phaseItems.reduce(0) { $0 + $1.budget },
                actual: phaseItems.reduce(0) { $0 + $1.actual },
                committed: phaseItems.reduce(0) { $0 + $1.openCommitment } + approvedChanges
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

    var utilization: Double {
        guard budget > 0 else { return 0 }
        return (actual + committed) / budget
    }

    var health: BudgetHealth {
        if actual + committed > budget { return .overBudget }
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

    var utilization: Double {
        guard budget > 0 else { return 0 }
        return (actual + committed) / budget
    }

    var remaining: Double {
        budget - actual - committed
    }

    var health: BudgetHealth {
        if actual + committed > budget { return .overBudget }
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
