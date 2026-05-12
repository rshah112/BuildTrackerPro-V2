import Charts
import SwiftData
import SwiftUI
import UIKit

struct PortfolioInsightsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @Query(
        filter: #Predicate<Project> { $0.deletedAt == nil },
        sort: \Project.createdAt,
        order: .reverse
    ) private var projects: [Project]
    @Query(sort: \BudgetLineItem.costCode) private var items: [BudgetLineItem]
    @Query(sort: \Expense.date, order: .reverse) private var expenses: [Expense]
    @Query(sort: \AllowanceSelection.selectionDate, order: .reverse) private var allowanceSelections: [AllowanceSelection]

    @State private var selectedTab: InsightsTab = .costPerSquareFoot
    @State private var activePDF: InsightsPDF?
    @State private var exportError: String?

    private var activeProjectIDs: Set<UUID> {
        Set(projects.map(\.id))
    }

    private var activeItems: [BudgetLineItem] {
        items.filter { activeProjectIDs.contains($0.projectID) }
    }

    private var activeExpenses: [Expense] {
        expenses.filter { activeProjectIDs.contains($0.projectID) }
    }

    private var activeAllowanceSelections: [AllowanceSelection] {
        allowanceSelections.filter { activeProjectIDs.contains($0.projectID) }
    }

    private var activeChangeOrders: [ChangeOrder] {
        changeOrders.filter { activeProjectIDs.contains($0.projectID) }
    }

    private var changeOrders: [ChangeOrder] {
        fetchChangeOrders()
    }

    private var costRows: [CostPerSquareFootRow] {
        InsightsMath.costPerSquareFootRows(
            projects: projects,
            items: activeItems,
            expenses: activeExpenses,
            allowanceSelections: activeAllowanceSelections,
            changeOrders: activeChangeOrders
        )
    }

    private var phaseRows: [PhasePercentRow] {
        InsightsMath.phasePercentRows(projects: projects, items: activeItems)
    }

    private var trendRows: [CategoryTrendRow] {
        InsightsMath.categoryTrendRows(expenses: activeExpenses)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Portfolio Insights")
                            .font(.title2.weight(.bold))
                        Text("Compare completed and active projects without opening each job.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }
                .listRowBackground(Color.clear)

                Section {
                    Picker("Insight", selection: $selectedTab) {
                        ForEach(InsightsTab.allCases) { tab in Text(tab.title).tag(tab) }
                    }
                    .pickerStyle(.segmented)
                }

                switch selectedTab {
                case .costPerSquareFoot:
                    costPerSquareFootSection
                case .phasePercent:
                    phasePercentSection
                case .categoryTrend:
                    categoryTrendSection
                }

                if let exportError {
                    Section { Text(exportError).foregroundStyle(AppTheme.negative) }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(AppTheme.pageBackground)
            .navigationTitle("Insights")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { exportPDF() } label: { Image(systemName: "square.and.arrow.up") }
                        .accessibilityLabel("Export Insights PDF")
                }
            }
            .sheet(item: $activePDF) { pdf in InsightsActivityView(url: pdf.url) }
        }
    }

    private var costPerSquareFootSection: some View {
        Section("$/sqft per project") {
            if costRows.isEmpty {
                EmptyStateView(
                    title: "No square footage yet",
                    subtitle: "Add square footage in Project Info to compare cost per square foot.",
                    systemImage: "ruler"
                )
            } else {
                Chart(costRows) { row in
                    BarMark(x: .value("Project", row.projectName), y: .value("$/sqft", row.costPerSquareFoot))
                        .foregroundStyle(AppTheme.accent)
                }
                .frame(height: 220)

                ForEach(costRows) { row in
                    InsightsValueRow(
                        title: row.projectName,
                        subtitle: "\(row.squareFootage.formatted(.number.precision(.fractionLength(0)))) sqft",
                        value: row.costPerSquareFoot.currencyString,
                        systemImage: "ruler"
                    )
                }
            }
        }
    }

    private var phasePercentSection: some View {
        Section("% per phase across completed projects") {
            if phaseRows.isEmpty {
                EmptyStateView(
                    title: "No completed budget data",
                    subtitle: "Completed projects with budget items will appear here.",
                    systemImage: "chart.pie"
                )
            } else {
                Chart(phaseRows) { row in
                    BarMark(x: .value("Percent", row.percent), y: .value("Phase", row.category))
                        .foregroundStyle(AppTheme.info)
                }
                .frame(height: max(180, CGFloat(phaseRows.count) * 28))

                ForEach(phaseRows) { row in
                    InsightsValueRow(
                        title: row.category,
                        subtitle: "Completed portfolio",
                        value: row.percent.formatted(.number.precision(.fractionLength(1))) + "%",
                        systemImage: "chart.pie"
                    )
                }
            }
        }
    }

    private var categoryTrendSection: some View {
        Section("Trend over time per category") {
            if trendRows.isEmpty {
                EmptyStateView(
                    title: "No expense trend yet",
                    subtitle: "Expenses will create category trends over time.",
                    systemImage: "chart.xyaxis.line"
                )
            } else {
                Chart(trendRows) { row in
                    LineMark(x: .value("Month", row.month), y: .value("Amount", row.amount))
                        .foregroundStyle(by: .value("Category", row.category))
                    PointMark(x: .value("Month", row.month), y: .value("Amount", row.amount))
                        .foregroundStyle(by: .value("Category", row.category))
                }
                .frame(height: 260)

                ForEach(trendRows.prefix(24)) { row in
                    InsightsValueRow(
                        title: row.category,
                        subtitle: row.monthLabel,
                        value: row.amount.compactCurrencyString,
                        systemImage: "calendar"
                    )
                }
            }
        }
    }

    private func fetchChangeOrders() -> [ChangeOrder] {
        let descriptor = FetchDescriptor<ChangeOrder>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func exportPDF() {
        do {
            activePDF = try InsightsPDF(url: InsightsPDFService.createPDF(
                projects: projects,
                items: items,
                expenses: expenses,
                allowanceSelections: allowanceSelections,
                changeOrders: changeOrders
            ))
            exportError = nil
            Haptics.success()
        } catch {
            exportError = error.localizedDescription
            Haptics.warning()
        }
    }
}

enum InsightsMath {
    static func costPerSquareFootRows(
        projects: [Project],
        items: [BudgetLineItem],
        expenses: [Expense],
        allowanceSelections: [AllowanceSelection] = [],
        changeOrders: [ChangeOrder]
    ) -> [CostPerSquareFootRow] {
        let itemsByProject = Dictionary(grouping: items, by: \.projectID)
        let expensesByProject = Dictionary(grouping: expenses, by: \.projectID)
        let selectionsByProject = Dictionary(grouping: allowanceSelections, by: \.projectID)
        let ordersByProject = Dictionary(grouping: changeOrders, by: \.projectID)
        return projects.compactMap { project in
            guard let sqft = project.squareFootage, sqft > 0 else { return nil }
            let total = BudgetMathService.actualSpend(
                items: itemsByProject[project.id, default: []],
                expenses: expensesByProject[project.id, default: []],
                allowanceSelections: selectionsByProject[project.id, default: []],
                changeOrders: ordersByProject[project.id, default: []]
            )
            let fallback = project.constructionBudget > 0
                ? project.constructionBudget.roundedToCents
                : MoneyMath.sum(items.filter { $0.projectID == project.id }, by: \.budget)
            let cost = total > 0 ? total : fallback
            guard cost > 0 else { return nil }
            return CostPerSquareFootRow(projectName: project.name, squareFootage: sqft, cost: cost, costPerSquareFoot: cost / sqft)
        }
        .sorted { $0.costPerSquareFoot > $1.costPerSquareFoot }
    }

    static func phasePercentRows(projects: [Project], items: [BudgetLineItem]) -> [PhasePercentRow] {
        let completedIDs = Set(projects.filter { $0.status == .complete }.map(\.id))
        let completedItems = items
            .filter { completedIDs.contains($0.projectID) && $0.categoryName.caseInsensitiveCompare("Contingency") != .orderedSame }
        let total = MoneyMath.sum(completedItems, by: \.budget)
        guard total > 0 else { return [] }
        return Dictionary(grouping: completedItems, by: \.categoryName).map { category, items in
            let amount = MoneyMath.sum(items, by: \.budget)
            return PhasePercentRow(category: category, amount: amount, percent: amount / total * 100)
        }
        .sorted { $0.percent > $1.percent }
    }

    static func categoryTrendRows(expenses: [Expense]) -> [CategoryTrendRow] {
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: expenses) { expense -> TrendKey in
            let comps = calendar.dateComponents([.year, .month], from: expense.date)
            let month = calendar.date(from: comps) ?? expense.date
            return TrendKey(month: month, category: expense.categoryName.trimmed.isEmpty ? "Unassigned" : expense.categoryName.trimmed)
        }
        return grouped.map { key, expenses in
            CategoryTrendRow(month: key.month, category: key.category, amount: MoneyMath.sum(expenses, by: \.amount))
        }
        .sorted {
            if $0.month == $1.month { return $0.category.localizedStandardCompare($1.category) == .orderedAscending }
            return $0.month < $1.month
        }
    }
}

private enum InsightsTab: String, CaseIterable, Identifiable {
    case costPerSquareFoot
    case phasePercent
    case categoryTrend

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .costPerSquareFoot: "$/sqft"
        case .phasePercent: "% Phase"
        case .categoryTrend: "Trend"
        }
    }
}

struct CostPerSquareFootRow: Identifiable {
    let id = UUID()
    let projectName: String
    let squareFootage: Double
    let cost: Double
    let costPerSquareFoot: Double
}

struct PhasePercentRow: Identifiable {
    let id = UUID()
    let category: String
    let amount: Double
    let percent: Double
}

struct CategoryTrendRow: Identifiable {
    let id = UUID()
    let month: Date
    let category: String
    let amount: Double

    var monthLabel: String {
        month.formatted(.dateTime.month(.abbreviated).year())
    }
}

private struct TrendKey: Hashable {
    let month: Date
    let category: String
}

private struct InsightsValueRow: View {
    let title: String
    let subtitle: String
    let value: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 32, height: 32)
                .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(value)
                .font(.subheadline.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .padding(.vertical, 4)
    }
}

private struct InsightsPDF: Identifiable {
    let id = UUID()
    let url: URL
}

private struct InsightsActivityView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
