import SwiftData
import SwiftUI

// MARK: - Filter / sort / group enums

enum ExpenseListFilter: String, CaseIterable, Identifiable, Hashable {
    case all = "All"
    case open = "Open"
    case paid = "Paid"

    var id: String {
        rawValue
    }
}

private enum ExpenseDateFilter: String, CaseIterable, Identifiable {
    case all
    case thisMonth
    case ninetyDays
    case thisYear

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All dates"
        case .thisMonth: "This month"
        case .ninetyDays: "90 days"
        case .thisYear: "This year"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "calendar"
        case .thisMonth: "calendar.badge.clock"
        case .ninetyDays: "calendar.day.timeline.left"
        case .thisYear: "calendar.circle"
        }
    }

    func contains(_ date: Date, calendar: Calendar = .current, now: Date = .now) -> Bool {
        switch self {
        case .all:
            return true
        case .thisMonth:
            let comps = calendar.dateComponents([.year, .month], from: now)
            let candidate = calendar.dateComponents([.year, .month], from: date)
            return comps.year == candidate.year && comps.month == candidate.month
        case .ninetyDays:
            guard let cutoff = calendar.date(byAdding: .day, value: -90, to: now) else { return true }
            return date >= cutoff
        case .thisYear:
            return calendar.component(.year, from: date) == calendar.component(.year, from: now)
        }
    }
}

private enum ExpenseSortField: String, CaseIterable, Identifiable {
    case date
    case amount
    case vendor
    case dueDate

    var id: String { rawValue }

    var title: String {
        switch self {
        case .date: "Date"
        case .amount: "Amount"
        case .vendor: "Vendor"
        case .dueDate: "Due date"
        }
    }
}

private enum ExpenseGroupBy: String, CaseIterable, Identifiable {
    case none
    case month
    case category
    case vendor

    var id: String { rawValue }

    var title: String {
        switch self {
        case .none: "Don't group"
        case .month: "Group by month"
        case .category: "Group by category"
        case .vendor: "Group by vendor"
        }
    }
}

// MARK: - View

struct ExpensesView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let initialFilter: ExpenseListFilter

    @State private var showingAddExpense = false
    @State private var expenseRouteToEdit: ExpenseEditRoute?
    @State private var searchText = ""
    @State private var expenseRows: [ExpenseRowSnapshot] = []
    @State private var selectedFilter: ExpenseListFilter

    @AppStorage(AppSettingsKeys.expensesDateFilter) private var dateFilterRaw = ExpenseDateFilter.all.rawValue
    @AppStorage(AppSettingsKeys.expensesSortField) private var sortFieldRaw = ExpenseSortField.date.rawValue
    @AppStorage(AppSettingsKeys.expensesSortAscending) private var sortAscending = false
    @AppStorage(AppSettingsKeys.expensesGroupBy) private var groupByRaw = ExpenseGroupBy.none.rawValue

    @ObservedObject private var health = StorageHealthMonitor.shared

    init(project: Project, initialFilter: ExpenseListFilter = .all) {
        self.project = project
        self.initialFilter = initialFilter
        _selectedFilter = State(initialValue: initialFilter)
    }

    // MARK: - Derived state

    private var dateFilter: ExpenseDateFilter {
        ExpenseDateFilter(rawValue: dateFilterRaw) ?? .all
    }

    private var sortField: ExpenseSortField {
        ExpenseSortField(rawValue: sortFieldRaw) ?? .date
    }

    private var groupBy: ExpenseGroupBy {
        ExpenseGroupBy(rawValue: groupByRaw) ?? .none
    }

    private var statusFilteredRows: [ExpenseRowSnapshot] {
        switch selectedFilter {
        case .all:
            return expenseRows
        case .open:
            return expenseRows.filter { !$0.isPaid || $0.balanceDue > 0 }
        case .paid:
            return expenseRows.filter { $0.isPaid && $0.balanceDue <= 0 }
        }
    }

    private var dateFilteredRows: [ExpenseRowSnapshot] {
        let filter = dateFilter
        guard filter != .all else { return statusFilteredRows }
        return statusFilteredRows.filter { filter.contains($0.date) }
    }

    private var searchedRows: [ExpenseRowSnapshot] {
        guard !searchText.trimmed.isEmpty else { return dateFilteredRows }
        let query = searchText.localizedLowercase
        return dateFilteredRows.filter {
            $0.vendorName.localizedLowercase.contains(query) ||
                $0.categoryName.localizedLowercase.contains(query) ||
                $0.budgetLineItemTitle.localizedLowercase.contains(query) ||
                $0.invoiceNumber.localizedLowercase.contains(query) ||
                $0.notes.localizedLowercase.contains(query)
        }
    }

    private var sortedRows: [ExpenseRowSnapshot] {
        let rows = searchedRows
        let direction: ComparisonResult = sortAscending ? .orderedAscending : .orderedDescending
        return rows.sorted { lhs, rhs in
            sortComparison(lhs, rhs, field: sortField) == direction
        }
    }

    private var groupedRows: [(title: String, rows: [ExpenseRowSnapshot])] {
        switch groupBy {
        case .none:
            return [("", sortedRows)]
        case .month:
            return groupedByMonth(sortedRows)
        case .category:
            return groupedByKey(sortedRows) { $0.categoryName.trimmed.isEmpty ? "Unassigned" : $0.categoryName }
        case .vendor:
            return groupedByKey(sortedRows) { $0.vendorName.trimmed.isEmpty ? "Unknown vendor" : $0.vendorName }
        }
    }

    private var constructionRows: [ExpenseRowSnapshot] {
        expenseRows.filter { $0.categoryName.trimmed.caseInsensitiveCompare("Contingency") != .orderedSame }
    }

    private var unpaidTotal: Double {
        MoneyMath.sum(constructionRows, by: \.balanceDue)
    }

    private var paidTotal: Double {
        MoneyMath.sum(constructionRows, by: \.effectiveAmountPaid)
    }

    private var loggedTotal: Double {
        MoneyMath.sum(constructionRows, by: \.amount)
    }

    private var overdueCount: Int {
        let now = Date()
        return expenseRows.filter { row in
            guard let dueDate = row.dueDate else { return false }
            return row.balanceDue > 0 && dueDate < now
        }.count
    }

    private var next14DaysDueTotal: Double {
        let now = Date()
        let horizon = Calendar.current.date(byAdding: .day, value: 14, to: now) ?? now
        let upcoming = expenseRows.filter { row in
            guard row.balanceDue > 0,
                  let dueDate = row.dueDate ?? row.expectedPaymentDate
            else { return false }
            return dueDate >= now && dueDate <= horizon
        }
        return MoneyMath.sum(upcoming, by: \.balanceDue)
    }

    private var hasActiveFilters: Bool {
        selectedFilter != .all || dateFilter != .all || !searchText.trimmed.isEmpty
    }

    private var emptyStateTitle: String {
        if !expenseRows.isEmpty, sortedRows.isEmpty {
            return "No matches"
        }
        switch selectedFilter {
        case .all: return "No expenses yet"
        case .open: return "No open expenses"
        case .paid: return "No paid expenses"
        }
    }

    private var emptyStateSubtitle: String {
        if !expenseRows.isEmpty, sortedRows.isEmpty {
            return hasActiveFilters
                ? "Clear filters or search to see all logged expenses."
                : "Try a different status."
        }
        switch selectedFilter {
        case .all: return "Add invoices, receipts and quick jobsite costs."
        case .open: return "Everything logged is paid or there are no invoices yet."
        case .paid: return "Paid expenses will show here as the project moves."
        }
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            List {
                summaryTilesSection
                if !expenseRows.isEmpty {
                    alertRow
                    statusPickerSection
                    dateChipsSection
                }
                expensesSection
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(AppTheme.pageBackground)
            .navigationTitle("Expenses")
            .primaryFloatingAction(title: "Expense") {
                showingAddExpense = true
            }
            .searchable(text: $searchText, prompt: "Search vendor, invoice, notes, line item")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    organizationMenu
                }
            }
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

    // MARK: - Sections

    @ViewBuilder
    private var summaryTilesSection: some View {
        Section {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3), spacing: 8) {
                ExpenseSummaryTile(
                    title: "Logged",
                    value: loggedTotal.compactCurrencyString,
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
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
            .listRowBackground(Color.clear)

            if !expenseRows.isEmpty {
                HStack(spacing: 8) {
                    Label("\(expenseRows.count) total", systemImage: "creditcard")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    backupBadge
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
            }
        }
    }

    @ViewBuilder
    private var alertRow: some View {
        if overdueCount > 0 || next14DaysDueTotal > 0 {
            Section {
                HStack(spacing: 10) {
                    if overdueCount > 0 {
                        alertBadge(
                            systemImage: "exclamationmark.triangle.fill",
                            tint: AppTheme.negative,
                            primary: "\(overdueCount) overdue",
                            secondary: "Tap Open to review"
                        ) {
                            selectedFilter = .open
                        }
                    }
                    if next14DaysDueTotal > 0 {
                        alertBadge(
                            systemImage: "calendar.badge.clock",
                            tint: AppTheme.warning,
                            primary: next14DaysDueTotal.compactCurrencyString,
                            secondary: "Due in 14 days"
                        ) {
                            selectedFilter = .open
                        }
                    }
                }
                .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
        }
    }

    private func alertBadge(systemImage: String, tint: Color, primary: String, secondary: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 32, height: 32)
                    .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 1) {
                    Text(primary)
                        .font(.subheadline.weight(.bold))
                    Text(secondary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity)
            .background(AppTheme.cardBackground, in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 0.75)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var backupBadge: some View {
        switch health.iCloudAvailable {
        case .some(true):
            Label("Backed up", systemImage: "icloud.fill")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.green)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.13), in: Capsule())
        case .some(false):
            Label("Local only", systemImage: "iphone")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.orange)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.13), in: Capsule())
        case .none:
            EmptyView()
        }
    }

    private var statusPickerSection: some View {
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
    }

    private var dateChipsSection: some View {
        Section {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ExpenseDateFilter.allCases) { option in
                        Button {
                            withAnimation(.smooth(duration: 0.2)) {
                                dateFilterRaw = option.rawValue
                            }
                        } label: {
                            Label(option.title, systemImage: option.systemImage)
                                .font(.caption.weight(.bold))
                                .foregroundStyle(dateFilter == option ? .white : .primary)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(dateFilter == option ? AppTheme.brand : AppTheme.surface, in: Capsule())
                                .overlay(
                                    Capsule()
                                        .strokeBorder(dateFilter == option ? Color.clear : AppTheme.border, lineWidth: 0.75)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 4)
            }
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
            .listRowBackground(Color.clear)
        }
    }

    @ViewBuilder
    private var expensesSection: some View {
        if sortedRows.isEmpty {
            Section("Expenses") {
                emptyState
            }
        } else {
            ForEach(groupedRows, id: \.title) { group in
                Section(header: groupHeader(for: group)) {
                    ForEach(group.rows) { row in
                        ExpenseRow(row: row, isOverdue: isOverdue(row))
                            .contentShape(Rectangle())
                            .onTapGesture {
                                editExpense(withID: row.id)
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                Button {
                                    Haptics.lightTap()
                                    queuePaidChange(!row.isPaid, forExpenseID: row.id)
                                } label: {
                                    Label(row.isPaid ? "Unpaid" : "Paid", systemImage: row.isPaid ? "clock" : "checkmark.circle")
                                }
                                .tint(row.isPaid ? AppTheme.warning : AppTheme.positive)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    deleteExpense(withID: row.id)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
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
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 12) {
            EmptyStateView(title: emptyStateTitle, subtitle: emptyStateSubtitle, systemImage: "creditcard")
            if !expenseRows.isEmpty, sortedRows.isEmpty, hasActiveFilters {
                Button("Clear filters") {
                    selectedFilter = .all
                    dateFilterRaw = ExpenseDateFilter.all.rawValue
                    searchText = ""
                }
                .buttonStyle(.bordered)
            } else if expenseRows.isEmpty {
                Button {
                    showingAddExpense = true
                } label: {
                    Label("Add first expense", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func groupHeader(for group: (title: String, rows: [ExpenseRowSnapshot])) -> some View {
        if group.title.isEmpty {
            Text("Expenses")
        } else {
            HStack {
                Text(group.title)
                Spacer()
                Text(MoneyMath.sum(group.rows, by: \.amount).compactCurrencyString)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Organization menu

    private var organizationMenu: some View {
        Menu {
            Section("Sort") {
                ForEach(ExpenseSortField.allCases) { field in
                    Button {
                        if sortField == field {
                            sortAscending.toggle()
                        } else {
                            sortFieldRaw = field.rawValue
                            sortAscending = field == .vendor // alphabetical ascending makes sense, others descending
                        }
                    } label: {
                        Label(field.title, systemImage: sortField == field ? (sortAscending ? "arrow.up" : "arrow.down") : "")
                    }
                }
            }
            Section("Group") {
                ForEach(ExpenseGroupBy.allCases) { option in
                    Button {
                        groupByRaw = option.rawValue
                    } label: {
                        Label(option.title, systemImage: groupBy == option ? "checkmark" : "")
                    }
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Sort and group")
    }

    // MARK: - Sorting + grouping helpers

    private func sortComparison(_ lhs: ExpenseRowSnapshot, _ rhs: ExpenseRowSnapshot, field: ExpenseSortField) -> ComparisonResult {
        switch field {
        case .date:
            if lhs.date == rhs.date { return .orderedSame }
            return lhs.date < rhs.date ? .orderedAscending : .orderedDescending
        case .amount:
            let lhsCents = MoneyMath.cents(lhs.amount)
            let rhsCents = MoneyMath.cents(rhs.amount)
            if lhsCents == rhsCents { return .orderedSame }
            return lhsCents < rhsCents ? .orderedAscending : .orderedDescending
        case .vendor:
            return lhs.vendorName.localizedCaseInsensitiveCompare(rhs.vendorName)
        case .dueDate:
            // Treat nil due dates as far-future so they sort last when ascending.
            let lhsDate = lhs.dueDate ?? .distantFuture
            let rhsDate = rhs.dueDate ?? .distantFuture
            if lhsDate == rhsDate { return .orderedSame }
            return lhsDate < rhsDate ? .orderedAscending : .orderedDescending
        }
    }

    private func groupedByMonth(_ rows: [ExpenseRowSnapshot]) -> [(title: String, rows: [ExpenseRowSnapshot])] {
        let calendar = Calendar.current
        let monthFormatter: DateFormatter = {
            let f = DateFormatter()
            f.dateFormat = "MMMM yyyy"
            return f
        }()
        let grouped = Dictionary(grouping: rows) { row -> Date in
            let comps = calendar.dateComponents([.year, .month], from: row.date)
            return calendar.date(from: comps) ?? row.date
        }
        return grouped
            .sorted { $0.key > $1.key }
            .map { (title: monthFormatter.string(from: $0.key), rows: $0.value) }
    }

    private func groupedByKey(
        _ rows: [ExpenseRowSnapshot],
        key: (ExpenseRowSnapshot) -> String
    ) -> [(title: String, rows: [ExpenseRowSnapshot])] {
        let grouped = Dictionary(grouping: rows, by: key)
        return grouped
            .sorted { $0.key.localizedCaseInsensitiveCompare($1.key) == .orderedAscending }
            .map { (title: $0.key, rows: $0.value) }
    }

    private func isOverdue(_ row: ExpenseRowSnapshot) -> Bool {
        guard let dueDate = row.dueDate, row.balanceDue > 0 else { return false }
        return dueDate < .now
    }

    // MARK: - Actions

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
            if expense.amountPaid <= 0 {
                expense.amountPaid = expense.amount
            }
            if expense.paidDate == nil {
                expense.paidDate = Date()
            }
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
            changeOrders: fetchChangeOrders(),
            allowanceSelections: fetchAllowanceSelections()
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

    private func fetchAllowanceSelections() -> [AllowanceSelection] {
        let projectID = project.id
        let descriptor = FetchDescriptor<AllowanceSelection>(
            predicate: #Predicate { $0.projectID == projectID }
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
    let expectedPaymentDate: Date?
    let categoryName: String
    let budgetLineItemTitle: String
    let notes: String
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
        expectedPaymentDate = expense.expectedPaymentDate
        categoryName = expense.categoryName
        budgetLineItemTitle = expense.budgetLineItemTitle
        notes = expense.notes
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
    let isOverdue: Bool

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

                    if isOverdue {
                        Text("OVERDUE")
                            .font(.caption2.weight(.heavy))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(AppTheme.negative, in: Capsule())
                    }
                }

                Text("\(row.categoryName) · \(row.date.shortDateString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                if !row.invoiceNumber.isEmpty || row.dueDate != nil {
                    Text([
                        row.invoiceNumber.isEmpty ? "" : "Inv \(row.invoiceNumber)",
                        row.dueDate.map { "Due \($0.shortDateString)" } ?? ""
                    ].filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.caption2)
                        .foregroundStyle(isOverdue ? AppTheme.negative : .secondary)
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
                        .foregroundStyle(isOverdue ? AppTheme.negative : AppTheme.warning)
                }
            }
        }
        .padding(.vertical, 8)
    }
}
