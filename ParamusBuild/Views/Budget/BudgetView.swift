import SwiftData
import SwiftUI

struct BudgetView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let initialSearchText: String

    @Query private var categories: [BudgetCategory]
    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]

    @State private var searchText = ""
    @State private var expandedCategories = Set<String>()
    @State private var showingAddItem = false
    @State private var deleteBlockedMessage: String?

    init(project: Project, initialSearchText: String = "") {
        self.project = project
        self.initialSearchText = initialSearchText
        _searchText = State(initialValue: initialSearchText)
        let projectID = project.id
        _categories = Query(filter: #Predicate<BudgetCategory> { $0.projectID == projectID }, sort: \.sortOrder)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private var filteredItems: [BudgetLineItem] {
        guard !searchText.trimmed.isEmpty else { return items }
        let query = searchText.localizedLowercase
        return items.filter {
            $0.title.localizedLowercase.contains(query) ||
                $0.costCode.localizedLowercase.contains(query) ||
                $0.categoryName.localizedLowercase.contains(query)
        }
    }

    private var groupedItems: [String: [BudgetLineItem]] {
        Dictionary(grouping: filteredItems, by: \.categoryName)
    }

    private var constructionItems: [BudgetLineItem] {
        items.filter { $0.categoryName.trimmed.caseInsensitiveCompare("Contingency") != .orderedSame }
    }

    private var budgetUsed: Double {
        constructionItems.reduce(0) { $0 + $1.spentAndCommitted }
    }

    private var budgetTotal: Double {
        project.constructionBudget > 0 ? project.constructionBudget : constructionItems.reduce(0) { $0 + $1.budget }
    }

    private var budgetRemaining: Double {
        budgetTotal - budgetUsed
    }

    private var budgetProgress: Double {
        guard budgetTotal > 0 else { return 0 }
        return budgetUsed / budgetTotal
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    BudgetOverviewCard(
                        used: budgetUsed,
                        total: budgetTotal,
                        remaining: budgetRemaining,
                        progress: budgetProgress,
                        itemCount: constructionItems.count,
                        overBudgetCount: constructionItems.filter { $0.health == .overBudget }.count
                    )
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                ForEach(categories) { category in
                    let categoryItems = groupedItems[category.name, default: []]

                    if !categoryItems.isEmpty {
                        Section {
                            if expandedCategories.contains(category.name) {
                                ForEach(categoryItems) { item in
                                    NavigationLink {
                                        BudgetDetailView(item: item)
                                    } label: {
                                        BudgetLineRow(item: item)
                                    }
                                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                        Button {
                                            Haptics.lightTap()
                                            setPinned(!item.isPinned, forItemID: item.id)
                                        } label: {
                                            Label(item.isPinned ? "Unpin" : "Pin", systemImage: item.isPinned ? "pin.slash" : "pin")
                                        }
                                        .tint(.blue)
                                    }
                                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                        Button(role: .destructive) {
                                            Haptics.lightTap()
                                            deleteItem(withID: item.id)
                                        } label: {
                                            Label("Delete", systemImage: "trash")
                                        }

                                        Button {
                                            Haptics.lightTap()
                                            flagForReview(itemID: item.id)
                                        } label: {
                                            Label("Review", systemImage: "flag")
                                        }
                                        .tint(AppTheme.warning)
                                    }
                                }
                            }
                        } header: {
                            BudgetCategoryHeader(
                                category: category,
                                items: categoryItems,
                                isExpanded: expandedCategories.contains(category.name)
                            )
                            .contentShape(Rectangle())
                            .onTapGesture {
                                withAnimation(.smooth(duration: 0.24)) {
                                    toggle(category.name)
                                }
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(AppTheme.pageBackground)
            .navigationTitle("Budget")
            .primaryFloatingAction(title: "Budget Item") {
                showingAddItem = true
            }
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search cost code, item, category"
            )
            .onAppear {
                if expandedCategories.isEmpty {
                    expandedCategories = Set(categories.map(\.name))
                }
                if BudgetMathService.recalculateActuals(
                    for: project.id,
                    items: items,
                    expenses: expenses,
                    changeOrders: fetchChangeOrders()
                ) {
                    saveChanges()
                }
            }
            .onChange(of: categories.map(\.name)) { _, names in
                expandedCategories.formUnion(names)
            }
            .onChange(of: initialSearchText) { _, newValue in
                searchText = newValue
                expandedCategories = Set(categories.map(\.name))
            }
            .sheet(isPresented: $showingAddItem) {
                AddBudgetItemView(project: project)
            }
            .alert("Budget Item In Use", isPresented: deleteBlockedBinding) {
                Button("OK", role: .cancel) { deleteBlockedMessage = nil }
            } message: {
                Text(deleteBlockedMessage ?? "")
            }
        }
    }

    private func toggle(_ categoryName: String) {
        if expandedCategories.contains(categoryName) {
            expandedCategories.remove(categoryName)
        } else {
            expandedCategories.insert(categoryName)
        }
    }

    private var deleteBlockedBinding: Binding<Bool> {
        Binding(
            get: { deleteBlockedMessage != nil },
            set: { isPresented in
                if !isPresented {
                    deleteBlockedMessage = nil
                }
            }
        )
    }

    private func setPinned(_ isPinned: Bool, forItemID itemID: UUID) {
        guard let item = fetchItem(withID: itemID) else { return }
        item.isPinned = isPinned
        saveChanges()
    }

    private func flagForReview(itemID: UUID) {
        guard let item = fetchItem(withID: itemID) else { return }
        item.notes = item.notes.isEmpty ? "Needs review" : item.notes
        saveChanges()
    }

    private func deleteItem(withID itemID: UUID) {
        guard let item = fetchItem(withID: itemID) else { return }
        let changeOrders = fetchChangeOrders()
        let linkedExpenses = expenses.filter { $0.budgetLineItemID == item.id }.count
        let linkedPhotos = photos.filter { $0.budgetLineItemID == item.id }.count
        let linkedChangeOrders = changeOrders.filter { $0.budgetLineItemID == item.id }.count
        let linkedCount = linkedExpenses + linkedPhotos + linkedChangeOrders

        guard linkedCount == 0 else {
            deleteBlockedMessage = "This item is linked to \(linkedExpenses) expenses, \(linkedPhotos) photos, and \(linkedChangeOrders) change orders. Reassign or delete those records first so project totals stay accurate."
            return
        }

        modelContext.delete(item)
        saveChanges()
    }

    private func fetchItem(withID itemID: UUID) -> BudgetLineItem? {
        let projectID = project.id
        let descriptor = FetchDescriptor<BudgetLineItem>(
            predicate: #Predicate { $0.id == itemID && $0.projectID == projectID }
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

    private func saveChanges() {
        do {
            try modelContext.save()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }
}

private struct BudgetCategoryHeader: View {
    let category: BudgetCategory
    let items: [BudgetLineItem]
    let isExpanded: Bool

    private var budget: Double {
        items.reduce(0) { $0 + $1.budget }
    }

    private var actual: Double {
        items.reduce(0) { $0 + $1.actual }
    }

    private var committed: Double {
        items.reduce(0) { $0 + $1.openCommitment }
    }

    private var health: BudgetHealth {
        let spent = actual + committed
        if spent > budget { return .overBudget }
        if budget > 0, spent / budget >= 0.9 { return .nearLimit }
        return .healthy
    }

    private var used: Double {
        actual + committed
    }

    private var utilization: Double {
        guard budget > 0 else { return 0 }
        return used / budget
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: category.systemImage)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(AppTheme.healthColor(health))
                    .frame(width: 32, height: 32)
                    .background(AppTheme.healthColor(health).opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(category.name)
                        .font(.headline.weight(.semibold))
                        .textCase(nil)
                        .foregroundStyle(.primary)

                    Text("\(used.compactCurrencyString) used of \(budget.compactCurrencyString)")
                        .font(.caption)
                        .textCase(nil)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                BudgetHealthPill(health: health)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
            }

            BudgetProgressBar(value: utilization, tint: AppTheme.healthColor(health))
        }
        .padding(.vertical, 10)
        .padding(.horizontal, AppTheme.pagePadding)
        .background(.thinMaterial)
    }
}

private struct BudgetOverviewCard: View {
    let used: Double
    let total: Double
    let remaining: Double
    let progress: Double
    let itemCount: Int
    let overBudgetCount: Int

    private var tint: Color {
        if progress > 1 { return AppTheme.negative }
        if progress >= 0.9 { return AppTheme.warning }
        return AppTheme.accent
    }

    var body: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Budget Progress")
                            .font(.headline.weight(.semibold))
                        Text("\((progress * 100).formatted(.number.precision(.fractionLength(0))))% used across \(itemCount) items")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    BudgetHealthPill(health: progress > 1 ? .overBudget : progress >= 0.9 ? .nearLimit : .healthy)
                }

                BudgetProgressBar(value: progress, tint: tint)

                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(used.compactCurrencyString)
                            .font(.system(.title3, design: .rounded, weight: .bold))
                        Text("Used")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 3) {
                        Text(total.compactCurrencyString)
                            .font(.system(.title3, design: .rounded, weight: .bold))
                        Text("Total budget")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }

                HStack {
                    Label(
                        remaining >= 0 ? "\(remaining.compactCurrencyString) remaining" : "\(abs(remaining).compactCurrencyString) over",
                        systemImage: remaining >= 0 ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(remaining >= 0 ? AppTheme.positive : AppTheme.negative)

                    Spacer()

                    if overBudgetCount > 0 {
                        Label("\(overBudgetCount) over", systemImage: "flag.fill")
                            .foregroundStyle(AppTheme.negative)
                    }
                }
                .font(.caption.weight(.bold))
            }
        }
    }
}

private struct BudgetLineRow: View {
    let item: BudgetLineItem

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Text(item.costCode)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.healthColor(item.health))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(AppTheme.healthColor(item.health).opacity(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(item.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                            .lineLimit(2)

                        if item.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.caption)
                                .foregroundStyle(AppTheme.accent)
                        }
                    }

                    Text(item.categoryName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 2) {
                    Text(item.spentAndCommitted.compactCurrencyString)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(AppTheme.healthColor(item.health))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text("Used")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                BudgetMiniStat(title: "Budget", value: item.budget.compactCurrencyString)
                BudgetMiniStat(title: "Invoiced", value: item.actual.compactCurrencyString)
                BudgetMiniStat(title: "Open", value: item.openCommitment.compactCurrencyString)
                BudgetMiniStat(
                    title: item.remaining >= 0 ? "Remaining" : "Over",
                    value: abs(item.remaining).compactCurrencyString,
                    tint: item.remaining >= 0 ? AppTheme.positive : AppTheme.negative
                )
            }

            BudgetProgressBar(value: item.utilization, tint: AppTheme.healthColor(item.health))

            HStack {
                Text(item.spentAndCommitted.compactCurrencyString)
                Spacer()
                Text(item.budget.compactCurrencyString)
            }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 8)
    }
}

private struct BudgetMiniStat: View {
    let title: String
    let value: String
    var tint: Color = .primary

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Text(value)
                .font(.caption.weight(.bold))
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
