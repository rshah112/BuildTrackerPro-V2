import SwiftData
import SwiftUI

private enum ChangeOrderStatusFilter: String, CaseIterable, Identifiable {
    case all
    case pending
    case approved
    case paid

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .pending: "Pending"
        case .approved: "Approved"
        case .paid: "Paid"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "tray.full"
        case .pending: "clock"
        case .approved: "checkmark.circle"
        case .paid: "checkmark.seal"
        }
    }

    var tint: Color {
        switch self {
        case .all: AppTheme.brand
        case .pending: AppTheme.info
        case .approved: AppTheme.accent
        case .paid: AppTheme.positive
        }
    }

    func matches(_ status: ChangeOrderStatus) -> Bool {
        switch self {
        case .all: return true
        case .pending: return status == .pending
        case .approved: return status == .approved
        case .paid: return status == .paid
        }
    }
}

struct ChangeOrdersView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @State private var showingAddChangeOrder = false
    @State private var showingEditChangeOrder = false
    @State private var changeOrderIDToEdit: UUID?
    @State private var changeOrders: [ChangeOrder] = []
    @State private var searchText = ""

    @AppStorage(AppSettingsKeys.changeOrdersStatusFilter) private var statusFilterRaw = ChangeOrderStatusFilter.all.rawValue

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
    }

    // MARK: - Derived state

    private var statusFilter: ChangeOrderStatusFilter {
        ChangeOrderStatusFilter(rawValue: statusFilterRaw) ?? .all
    }

    private var pendingTotal: Double {
        MoneyMath.sum(changeOrders.filter { $0.status == .pending }, by: \.amount)
    }

    private var approvedTotal: Double {
        MoneyMath.sum(changeOrders.filter { $0.status == .approved }, by: \.amount)
    }

    private var paidTotal: Double {
        MoneyMath.sum(changeOrders.filter { $0.status == .paid }, by: \.amount)
    }

    private var totalOpen: Double {
        // "Open" = anything not yet paid (pending exposure + approved commitments).
        MoneyMath.dollars(MoneyMath.cents(pendingTotal) + MoneyMath.cents(approvedTotal))
    }

    private var statusFilteredOrders: [ChangeOrder] {
        guard statusFilter != .all else { return changeOrders }
        return changeOrders.filter { statusFilter.matches($0.status) }
    }

    private var searchedOrders: [ChangeOrder] {
        let query = searchText.trimmed.localizedLowercase
        guard !query.isEmpty else { return statusFilteredOrders }
        return statusFilteredOrders.filter { order in
            order.title.localizedLowercase.contains(query) ||
                order.categoryName.localizedLowercase.contains(query) ||
                order.budgetLineItemTitle.localizedLowercase.contains(query) ||
                order.notes.localizedLowercase.contains(query)
        }
    }

    private var hasActiveFilters: Bool {
        statusFilter != .all || !searchText.trimmed.isEmpty
    }

    private func statusCount(_ filter: ChangeOrderStatusFilter) -> Int {
        switch filter {
        case .all: return changeOrders.count
        case .pending, .approved, .paid:
            return changeOrders.filter { filter.matches($0.status) }.count
        }
    }

    // MARK: - Body

    var body: some View {
        List {
            Section {
                PremiumCard {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("Open Change Orders")
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(totalOpen.currencyString)
                                    .font(.system(.title2, design: .rounded, weight: .bold))
                            }
                            Spacer()
                            Image(systemName: "arrow.triangle.2.circlepath")
                                .font(.title2.weight(.semibold))
                                .foregroundStyle(AppTheme.accent)
                        }

                        HStack(spacing: 8) {
                            summaryChip("Pending", value: pendingTotal, tint: AppTheme.info)
                            summaryChip("Approved", value: approvedTotal, tint: AppTheme.accent)
                            summaryChip("Paid", value: paidTotal, tint: AppTheme.positive)
                        }
                    }
                }
                .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                .listRowBackground(Color.clear)
            }

            if !changeOrders.isEmpty {
                Section {
                    statusFilterBar
                        .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
                        .listRowBackground(Color.clear)
                }
            }

            ordersSection
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Change Orders")
        .searchable(text: $searchText, prompt: "Search title, category, notes")
        .primaryFloatingAction(title: "Change") {
            showingAddChangeOrder = true
        }
        .sheet(isPresented: $showingAddChangeOrder, onDismiss: refreshChangeOrders) {
            AddChangeOrderView(project: project)
        }
        .sheet(isPresented: $showingEditChangeOrder, onDismiss: {
            changeOrderIDToEdit = nil
            refreshChangeOrders()
        }) {
            if let changeOrderIDToEdit, let changeOrderToEdit = fetchChangeOrder(withID: changeOrderIDToEdit) {
                AddChangeOrderView(project: project, order: changeOrderToEdit)
            }
        }
        .onAppear {
            refreshChangeOrders()
        }
    }

    private func summaryChip(_ label: String, value: Double, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value.compactCurrencyString)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var statusFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ChangeOrderStatusFilter.allCases) { filter in
                    Button {
                        withAnimation(.smooth(duration: 0.2)) {
                            statusFilterRaw = filter.rawValue
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: filter.systemImage)
                                .font(.caption.weight(.bold))
                            Text(filter.title)
                                .font(.caption.weight(.bold))
                            Text("\(statusCount(filter))")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(statusFilter == filter ? .white.opacity(0.78) : .secondary)
                        }
                        .foregroundStyle(statusFilter == filter ? .white : .primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(statusFilter == filter ? filter.tint : AppTheme.surface, in: Capsule())
                        .overlay(
                            Capsule()
                                .strokeBorder(statusFilter == filter ? Color.clear : AppTheme.border, lineWidth: 0.75)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private var ordersSection: some View {
        if changeOrders.isEmpty {
            Section("Change Orders") {
                EmptyStateView(
                    title: "No change orders",
                    subtitle: "Track pending, approved and paid changes.",
                    systemImage: "arrow.triangle.2.circlepath"
                )
            }
        } else if searchedOrders.isEmpty {
            Section("Change Orders") {
                VStack(spacing: 12) {
                    EmptyStateView(
                        title: "No matches",
                        subtitle: hasActiveFilters
                            ? "Clear the status filter or search to see all change orders."
                            : "Try a different filter.",
                        systemImage: "magnifyingglass"
                    )
                    if hasActiveFilters {
                        Button("Clear filters") {
                            statusFilterRaw = ChangeOrderStatusFilter.all.rawValue
                            searchText = ""
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
        } else {
            Section("Change Orders") {
                ForEach(searchedOrders.map(ChangeOrderRowSnapshot.init)) { row in
                    ChangeOrderRow(row: row)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            editChangeOrder(withID: row.id)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                deleteChangeOrder(withID: row.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .contextMenu {
                            Button {
                                editChangeOrder(withID: row.id)
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }

                            Button(role: .destructive) {
                                deleteChangeOrder(withID: row.id)
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
        }
    }

    private func editChangeOrder(withID orderID: UUID) {
        guard fetchChangeOrder(withID: orderID) != nil else {
            refreshChangeOrders()
            return
        }

        changeOrderIDToEdit = orderID
        showingEditChangeOrder = true
    }

    private func deleteChangeOrder(withID orderID: UUID) {
        guard let order = fetchChangeOrder(withID: orderID) else {
            refreshChangeOrders()
            return
        }

        modelContext.delete(order)
        changeOrders.removeAll { $0.id == orderID }
        BudgetMathService.recalculateActuals(
            for: project.id,
            items: items,
            expenses: expenses,
            changeOrders: changeOrders,
            allowanceSelections: fetchAllowanceSelections()
        )
        saveChanges()
    }

    private func refreshChangeOrders() {
        changeOrders = fetchChangeOrders()
        if BudgetMathService.recalculateActuals(
            for: project.id,
            items: items,
            expenses: expenses,
            changeOrders: changeOrders,
            allowanceSelections: fetchAllowanceSelections()
        ) {
            saveChanges()
        }
    }

    private func fetchChangeOrder(withID orderID: UUID) -> ChangeOrder? {
        let projectID = project.id
        let descriptor = FetchDescriptor<ChangeOrder>(
            predicate: #Predicate { $0.id == orderID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
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

    private func saveChanges() {
        do {
            try modelContext.save()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }
}

private struct ChangeOrderRowSnapshot: Identifiable {
    let id: UUID
    let title: String
    let amount: Double
    let status: ChangeOrderStatus
    let categoryName: String
    let createdAt: Date
    let notes: String
    let budgetLineItemTitle: String

    init(order: ChangeOrder) {
        id = order.id
        title = order.title
        amount = order.amount
        status = order.status
        categoryName = order.categoryName
        createdAt = order.createdAt
        notes = order.notes
        budgetLineItemTitle = order.budgetLineItemTitle
    }
}

private struct ChangeOrderRow: View {
    let row: ChangeOrderRowSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(row.title)
                        .font(.headline.weight(.semibold))
                    Text("\(row.categoryName) - \(row.createdAt.shortDateString)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(row.amount.currencyString)
                    .font(.subheadline.weight(.bold))
            }

            HStack {
                StatusBadge(status: row.status)
                if !row.notes.isEmpty {
                    Text(row.notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                if !row.budgetLineItemTitle.isEmpty {
                    Text(row.budgetLineItemTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 8)
    }
}

struct AddChangeOrderView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var categories: [BudgetCategory]
    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]

    @State private var title = ""
    @State private var amount: Double = 0
    @State private var status: ChangeOrderStatus = .pending
    @State private var categoryName = ""
    @State private var budgetLineItemID: UUID?
    @State private var notes = ""
    @State private var expectedPaymentDate = Date()
    @State private var hasExpectedPaymentDate = false
    let orderID: UUID?

    init(project: Project, order: ChangeOrder? = nil) {
        self.project = project
        orderID = order?.id
        let projectID = project.id
        _categories = Query(filter: #Predicate<BudgetCategory> { $0.projectID == projectID }, sort: \.sortOrder)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)

        _title = State(initialValue: order?.title ?? "")
        _amount = State(initialValue: order?.amount ?? 0)
        _status = State(initialValue: order?.status ?? .pending)
        _categoryName = State(initialValue: order?.categoryName ?? "")
        _budgetLineItemID = State(initialValue: order?.budgetLineItemID)
        _notes = State(initialValue: order?.notes ?? "")
        _expectedPaymentDate = State(initialValue: order?.expectedPaymentDate ?? Date())
        _hasExpectedPaymentDate = State(initialValue: order?.expectedPaymentDate != nil)
    }

    private var canSave: Bool {
        !title.trimmed.isEmpty && amount > 0 && !categoryName.isEmpty
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection(
                    "Change",
                    footer: "Pending change orders appear as pending exposure. Approved unpaid changes move into committed cash flow when they have an expected payment date."
                ) {
                    ModernField("Title") {
                        TextField("Change order title", text: $title)
                            .modernTextField()
                    }

                    ModernField("Amount") {
                        CurrencyField(value: $amount)
                            .modernTextField()
                    }

                    ModernField("Status") {
                        Picker("Status", selection: $status) {
                            ForEach(ChangeOrderStatus.allCases) { status in
                                Text(status.title).tag(status)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    ModernField("Category") {
                        Picker("Category", selection: $categoryName) {
                            ForEach(categories) { category in
                                Text(category.name).tag(category.name)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    ModernField("Budget item", subtitle: "Optional. Linking it keeps budget totals precise.") {
                        Picker("Budget item", selection: $budgetLineItemID) {
                            Text("None").tag(UUID?.none)
                            ForEach(items) { item in
                                Text("\(item.costCode)  \(item.title)").tag(Optional(item.id))
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    Toggle("Expected Payment", isOn: $hasExpectedPaymentDate)
                        .font(.body.weight(.medium))
                        .disabled(status == .paid)

                    if status != .paid, hasExpectedPaymentDate {
                        ModernField("Expected") {
                            DatePicker("Expected", selection: $expectedPaymentDate, displayedComponents: .date)
                                .labelsHidden()
                        }
                    }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional details", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(orderID == nil ? "Add Change" : "Edit Change")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(!canSave)
                }
            }
            .onAppear {
                if categoryName.isEmpty {
                    categoryName = categories.first?.name ?? ""
                }
                if status == .paid {
                    hasExpectedPaymentDate = false
                }
            }
            .onChange(of: status) { _, newStatus in
                if newStatus == .paid {
                    hasExpectedPaymentDate = false
                }
            }
        }
    }

    private var selectedItem: BudgetLineItem? {
        guard let budgetLineItemID else { return nil }
        return items.first { $0.id == budgetLineItemID }
    }

    private func save() {
        var effectiveChangeOrders = fetchChangeOrders()

        if let orderID {
            guard let orderToEdit = fetchChangeOrder(withID: orderID) else {
                Haptics.warning()
                return
            }
            orderToEdit.title = title.trimmed
            orderToEdit.amount = amount
            orderToEdit.status = status
            orderToEdit.notes = notes.trimmed
            orderToEdit.categoryName = selectedItem?.categoryName ?? categoryName
            orderToEdit.budgetLineItemID = selectedItem?.id
            orderToEdit.budgetLineItemTitle = selectedItem?.title ?? ""
            orderToEdit.expectedPaymentDate = resolvedExpectedPaymentDate
        } else {
            let order = ChangeOrder(
                projectID: project.id,
                title: title.trimmed,
                amount: amount,
                status: status,
                notes: notes.trimmed,
                categoryName: selectedItem?.categoryName ?? categoryName,
                budgetLineItemID: selectedItem?.id,
                budgetLineItemTitle: selectedItem?.title ?? "",
                expectedPaymentDate: resolvedExpectedPaymentDate
            )
            modelContext.insert(order)
            effectiveChangeOrders.append(order)
        }

        BudgetMathService.recalculateActuals(
            for: project.id,
            items: items,
            expenses: expenses,
            changeOrders: effectiveChangeOrders,
            allowanceSelections: fetchAllowanceSelections()
        )
        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
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

    private func fetchChangeOrder(withID orderID: UUID) -> ChangeOrder? {
        let projectID = project.id
        let descriptor = FetchDescriptor<ChangeOrder>(
            predicate: #Predicate { $0.id == orderID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }

    private var resolvedExpectedPaymentDate: Date? {
        guard status != .paid, hasExpectedPaymentDate else { return nil }
        return expectedPaymentDate
    }
}
