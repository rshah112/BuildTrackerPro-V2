import SwiftData
import SwiftUI

enum ExpenseListFilter: String, CaseIterable, Identifiable, Hashable {
    case all = "All"
    case open = "Open"
    case paid = "Paid"

    var id: String {
        rawValue
    }
}

struct ExpensesView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let initialFilter: ExpenseListFilter

    @State private var showingAddExpense = false
    @State private var expenseRouteToEdit: ExpenseEditRoute?
    @State private var searchText = ""
    @State private var expenseRows: [ExpenseRowSnapshot] = []
    @State private var selectedFilter: ExpenseListFilter

    init(project: Project, initialFilter: ExpenseListFilter = .all) {
        self.project = project
        self.initialFilter = initialFilter
        _selectedFilter = State(initialValue: initialFilter)
    }

    private var filteredExpenseRows: [ExpenseRowSnapshot] {
        let rows: [ExpenseRowSnapshot] = switch selectedFilter {
        case .all:
            expenseRows
        case .open:
            expenseRows.filter { !$0.isPaid || $0.balanceDue > 0 }
        case .paid:
            expenseRows.filter { $0.isPaid && $0.balanceDue <= 0 }
        }

        guard !searchText.trimmed.isEmpty else { return rows }
        let query = searchText.localizedLowercase
        return rows.filter {
            $0.vendorName.localizedLowercase.contains(query) ||
                $0.categoryName.localizedLowercase.contains(query) ||
                $0.budgetLineItemTitle.localizedLowercase.contains(query) ||
                $0.invoiceNumber.localizedLowercase.contains(query)
        }
    }

    private var constructionRows: [ExpenseRowSnapshot] {
        expenseRows.filter { $0.categoryName.trimmed.caseInsensitiveCompare("Contingency") != .orderedSame }
    }

    private var unpaidTotal: Double {
        constructionRows.reduce(0) { $0 + $1.balanceDue }
    }

    private var paidTotal: Double {
        constructionRows.reduce(0) { $0 + $1.effectiveAmountPaid }
    }

    private var emptyStateTitle: String {
        switch selectedFilter {
        case .all: "No expenses"
        case .open: "No open expenses"
        case .paid: "No paid expenses"
        }
    }

    private var emptyStateSubtitle: String {
        switch selectedFilter {
        case .all: "Add invoices, receipts and quick jobsite costs."
        case .open: "Everything logged is paid or there are no invoices yet."
        case .paid: "Paid expenses will show here as the project moves."
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                        ExpenseSummaryTile(
                            title: "Logged",
                            value: constructionRows.reduce(0) { $0 + $1.amount }.compactCurrencyString,
                            tint: AppTheme.accent,
                            isSelected: selectedFilter == .all
                        ) {
                            selectedFilter = .all
                        }
                        ExpenseSummaryTile(
                            title: "Paid",
                            value: paidTotal.compactCurrencyString,
                            tint: AppTheme.positive,
                            isSelected: selectedFilter == .paid
                        ) {
                            selectedFilter = .paid
                        }
                        ExpenseSummaryTile(
                            title: "Open",
                            value: unpaidTotal.compactCurrencyString,
                            tint: AppTheme.warning,
                            isSelected: selectedFilter == .open
                        ) {
                            selectedFilter = .open
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                Section {
                    Picker("Filter", selection: $selectedFilter) {
                        ForEach(ExpenseListFilter.allCases) { filter in
                            Text(filter.rawValue).tag(filter)
                        }
                    }
                    .pickerStyle(.segmented)
                    .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                Section("Expenses") {
                    if filteredExpenseRows.isEmpty {
                        EmptyStateView(title: emptyStateTitle, subtitle: emptyStateSubtitle, systemImage: "creditcard")
                            .padding(.vertical, 8)
                    } else {
                        ForEach(filteredExpenseRows) { row in
                            ExpenseRow(row: row)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    editExpense(withID: row.id)
                                }
                                .contextMenu {
                                    Button {
                                        editExpense(withID: row.id)
                                    } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }

                                    Button {
                                        Haptics.lightTap()
                                        queuePaidChange(!row.isPaid, forExpenseID: row.id)
                                    } label: {
                                        Label(row.isPaid ? "Unpaid" : "Paid", systemImage: row.isPaid ? "clock" : "checkmark.circle")
                                    }

                                    Button(role: .destructive) {
                                        deleteExpense(withID: row.id)
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(AppTheme.pageBackground)
            .navigationTitle("Expenses")
            .primaryFloatingAction(title: "Expense") {
                showingAddExpense = true
            }
            .searchable(text: $searchText, prompt: "Search expenses")
            .sheet(isPresented: $showingAddExpense, onDismiss: {
                refreshData()
            }) {
                AddExpenseView(project: project)
            }
            .sheet(item: $expenseRouteToEdit, onDismiss: {
                refreshData()
            }) { route in
                AddExpenseView(project: project, expenseID: route.id)
            }
            .onAppear {
                refreshData(recalculate: false)
                selectedFilter = initialFilter
            }
            .onChange(of: initialFilter) { _, newValue in
                selectedFilter = newValue
            }
            .onChange(of: selectedFilter) { _, _ in
                searchText = ""
            }
        }
    }

    private func editExpense(withID expenseID: UUID) {
        guard fetchExpense(withID: expenseID) != nil else { return }
        expenseRouteToEdit = ExpenseEditRoute(id: expenseID)
    }

    private func queuePaidChange(_ isPaid: Bool, forExpenseID expenseID: UUID) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            setPaid(isPaid, forExpenseID: expenseID)
        }
    }

    private func setPaid(_ isPaid: Bool, forExpenseID expenseID: UUID) {
        guard let expense = fetchExpense(withID: expenseID) else {
            refreshData()
            return
        }

        expense.isPaid = isPaid
        if isPaid {
            // Mark fully paid only if no prior partial payment exists.
            if expense.amountPaid <= 0 {
                expense.amountPaid = expense.amount
            }
            if expense.paidDate == nil {
                expense.paidDate = Date()
            }
        } else {
            // Preserve paid-field values; metrics ignore them while isPaid is false.
        }
        saveChanges()
        refreshData(recalculate: false)
    }

    private func deleteExpense(withID expenseID: UUID) {
        guard let expense = fetchExpense(withID: expenseID) else {
            refreshData()
            return
        }

        let deletedExpenseID = expense.id
        Haptics.lightTap()
        modelContext.delete(expense)
        if saveChanges() {
            MediaStorageService.removeReceipt(id: deletedExpenseID, project: project)
            refreshData()
        }
    }

    private func refreshData(recalculate: Bool = true) {
        let fetchedItems = fetchBudgetItems()
        let fetchedExpenses = fetchExpenses()
        expenseRows = fetchedExpenses.map(ExpenseRowSnapshot.init)
        if recalculate {
            if recalculateActuals(items: fetchedItems, expenses: fetchedExpenses) {
                saveChanges()
            }
        }
    }

    private func fetchExpense(withID expenseID: UUID) -> Expense? {
        let projectID = project.id
        let descriptor = FetchDescriptor<Expense>(
            predicate: #Predicate { $0.id == expenseID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }

    private func fetchBudgetItems() -> [BudgetLineItem] {
        let projectID = project.id
        let descriptor = FetchDescriptor<BudgetLineItem>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.costCode)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func fetchExpenses() -> [Expense] {
        let projectID = project.id
        let descriptor = FetchDescriptor<Expense>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    private func recalculateActuals(items effectiveItems: [BudgetLineItem], expenses effectiveExpenses: [Expense]) -> Bool {
        BudgetMathService.recalculateActuals(
            for: project.id,
            items: effectiveItems,
            expenses: effectiveExpenses,
            changeOrders: fetchChangeOrders()
        )
    }

    private func fetchChangeOrders() -> [ChangeOrder] {
        let projectID = project.id
        let descriptor = FetchDescriptor<ChangeOrder>(
            predicate: #Predicate { $0.projectID == projectID },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    @discardableResult
    private func saveChanges() -> Bool {
        do {
            try modelContext.save()
            return true
        } catch {
            Haptics.warning()
            modelContext.safeRollback()
            refreshData(recalculate: false)
            return false
        }
    }
}

private struct ExpenseEditRoute: Identifiable {
    let id: UUID
}

private struct ExpenseRowSnapshot: Identifiable {
    let id: UUID
    let amount: Double
    let amountPaid: Double
    let effectiveAmountPaid: Double
    let balanceDue: Double
    let vendorName: String
    let invoiceNumber: String
    let date: Date
    let dueDate: Date?
    let categoryName: String
    let budgetLineItemTitle: String
    let hasReceipt: Bool
    let isPaid: Bool

    init(expense: Expense) {
        id = expense.id
        amount = expense.amount
        amountPaid = expense.amountPaid
        effectiveAmountPaid = expense.effectiveAmountPaid
        balanceDue = expense.balanceDue
        vendorName = expense.vendorName
        invoiceNumber = expense.invoiceNumber
        date = expense.date
        dueDate = expense.dueDate
        categoryName = expense.categoryName
        budgetLineItemTitle = expense.budgetLineItemTitle
        hasReceipt = expense.receiptImageData != nil
        isPaid = expense.isPaid
    }
}

private struct ExpenseSummaryTile: View {
    let title: String
    let value: String
    let tint: Color
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(isSelected ? tint : .secondary)

                Text(value)
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(tint.opacity(isSelected ? 0.18 : 0.12), in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                    .strokeBorder(isSelected ? tint.opacity(0.42) : Color.clear, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}

private struct ExpenseRow: View {
    let row: ExpenseRowSnapshot

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(row.isPaid ? AppTheme.positive.opacity(0.13) : AppTheme.warning.opacity(0.14))

                Image(systemName: row.isPaid ? "checkmark" : "clock")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(row.isPaid ? AppTheme.positive : AppTheme.warning)
            }
            .frame(width: 42, height: 42)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(row.vendorName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)

                    if row.hasReceipt {
                        Image(systemName: "paperclip")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                    }
                }

                Text("\(row.categoryName) - \(row.date.shortDateString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if !row.invoiceNumber.isEmpty || row.dueDate != nil {
                    Text([
                        row.invoiceNumber.isEmpty ? "" : "Inv \(row.invoiceNumber)",
                        row.dueDate.map { "Due \($0.shortDateString)" } ?? ""
                    ].filter { !$0.isEmpty }.joined(separator: " - "))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }

                if !row.budgetLineItemTitle.isEmpty {
                    Text(row.budgetLineItemTitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text(row.amount.currencyString)
                    .font(.system(.headline, design: .rounded, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                if row.balanceDue > 0 {
                    Text("\(row.balanceDue.compactCurrencyString) due")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(AppTheme.warning)
                }
            }
        }
        .padding(.vertical, 8)
    }
}
