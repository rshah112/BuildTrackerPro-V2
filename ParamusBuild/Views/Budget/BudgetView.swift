import SwiftData
import SwiftUI

private enum BudgetGroupingMode: String, CaseIterable, Identifiable {
    case phase = "By Phase"
    case room = "By Room"

    var id: String {
        rawValue
    }
}

private enum BudgetSortField: String, CaseIterable, Identifiable {
    case costCode
    case budget
    case used
    case variance
    case utilization

    var id: String { rawValue }

    var title: String {
        switch self {
        case .costCode: "Cost code"
        case .budget: "Budget"
        case .used: "Used"
        case .variance: "Variance"
        case .utilization: "Utilization %"
        }
    }
}

private enum BudgetHealthFilter: String, CaseIterable, Identifiable {
    case all
    case overBudget
    case nearLimit
    case healthy

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .overBudget: "Over"
        case .nearLimit: "Near"
        case .healthy: "Healthy"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "tray.full"
        case .overBudget: "exclamationmark.triangle.fill"
        case .nearLimit: "flag.fill"
        case .healthy: "checkmark.seal.fill"
        }
    }

    var tint: Color {
        switch self {
        case .all: AppTheme.brand
        case .overBudget: AppTheme.negative
        case .nearLimit: AppTheme.warning
        case .healthy: AppTheme.positive
        }
    }

    func matches(_ item: BudgetLineItem) -> Bool {
        switch self {
        case .all: return true
        case .overBudget: return item.health == .overBudget
        case .nearLimit: return item.health == .nearLimit
        case .healthy: return item.health == .healthy
        }
    }
}

struct BudgetView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let initialSearchText: String

    @Query private var categories: [BudgetCategory]
    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]
    @Query private var allowanceSelections: [AllowanceSelection]

    @State private var searchText = ""
    @State private var expandedCategories = Set<String>()
    @State private var seededCategoryNames = Set<String>()
    @State private var showingAddItem = false
    @State private var deleteBlockedMessage: String?

    @AppStorage(AppSettingsKeys.budgetGroupingMode) private var groupingModeRaw = BudgetGroupingMode.phase.rawValue
    @AppStorage(AppSettingsKeys.budgetSortField) private var sortFieldRaw = BudgetSortField.costCode.rawValue
    @AppStorage(AppSettingsKeys.budgetSortAscending) private var sortAscending = true
    @AppStorage(AppSettingsKeys.budgetHealthFilter) private var healthFilterRaw = BudgetHealthFilter.all.rawValue

    @ObservedObject private var health = StorageHealthMonitor.shared

    init(project: Project, initialSearchText: String = "") {
        self.project = project
        self.initialSearchText = initialSearchText
        _searchText = State(initialValue: initialSearchText)
        let projectID = project.id
        _categories = Query(filter: #Predicate<BudgetCategory> { $0.projectID == projectID }, sort: \.sortOrder)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _allowanceSelections = Query(
            filter: #Predicate<AllowanceSelection> { $0.projectID == projectID },
            sort: \.selectionDate,
            order: .reverse
        )
    }

    // MARK: - Derived state

    private var groupingMode: BudgetGroupingMode {
        BudgetGroupingMode(rawValue: groupingModeRaw) ?? .phase
    }

    private var sortField: BudgetSortField {
        BudgetSortField(rawValue: sortFieldRaw) ?? .costCode
    }

    private var healthFilter: BudgetHealthFilter {
        BudgetHealthFilter(rawValue: healthFilterRaw) ?? .all
    }

    private var searchedItems: [BudgetLineItem] {
        let query = searchText.trimmed.localizedLowercase
        guard !query.isEmpty else { return items }
        return items.filter {
            $0.title.localizedLowercase.contains(query) ||
                $0.costCode.localizedLowercase.contains(query) ||
                $0.categoryName.localizedLowercase.contains(query) ||
                $0.notes.localizedLowercase.contains(query) ||
                displayRoom(for: $0).localizedLowercase.contains(query)
        }
    }

    private var filteredItems: [BudgetLineItem] {
        let filter = healthFilter
        guard filter != .all else { return searchedItems }
        return searchedItems.filter { filter.matches($0) }
    }

    private func sortedItems(_ source: [BudgetLineItem]) -> [BudgetLineItem] {
        let direction: ComparisonResult = sortAscending ? .orderedAscending : .orderedDescending
        return source.sorted { lhs, rhs in
            compare(lhs, rhs, by: sortField) == direction
        }
    }

    private var groupedItems: [String: [BudgetLineItem]] {
        Dictionary(grouping: filteredItems, by: \.categoryName)
    }

    private var groupedRoomItems: [String: [BudgetLineItem]] {
        Dictionary(grouping: filteredItems) { item in
            displayRoom(for: item)
        }
    }

    private var visibleRooms: [String] {
        let allowedRooms = RoomCatalog.rooms(for: project)
        let usedRooms = Set(filteredItems.map(displayRoom(for:)))
        let allowedUsedRooms = allowedRooms.filter { usedRooms.contains($0) }
        let extraRooms = usedRooms
            .filter { !allowedRooms.contains($0) }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }
        return allowedUsedRooms + extraRooms
    }

    private var constructionItems: [BudgetLineItem] {
        items.filter { $0.categoryName.trimmed.caseInsensitiveCompare("Contingency") != .orderedSame }
    }

    // Cent-exact rollups via MoneyMath so the overview card and progress bar never drift
    // and `progress > 1` / `>= 0.9` thresholds match what the per-item cards show.
    private var budgetUsed: Double {
        MoneyMath.sum(constructionItems, by: \.spentAndCommitted)
    }

    private var budgetTotal: Double {
        if project.constructionBudget > 0 {
            return project.constructionBudget.roundedToCents
        }
        return MoneyMath.sum(constructionItems, by: \.budget)
    }

    private var budgetRemaining: Double {
        MoneyMath.diff(budgetTotal, budgetUsed)
    }

    private var budgetProgress: Double {
        guard budgetTotal > 0 else { return 0 }
        return budgetUsed / budgetTotal
    }

    private var overBudgetCount: Int {
        constructionItems.filter { $0.health == .overBudget }.count
    }

    private var nearLimitCount: Int {
        constructionItems.filter { $0.health == .nearLimit }.count
    }

    private var allowanceCount: Int {
        items.filter(\.isAllowance).count
    }

    private var hasActiveFilters: Bool {
        !searchText.trimmed.isEmpty || healthFilter != .all
    }

    // MARK: - Body

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
                        overBudgetCount: overBudgetCount,
                        nearLimitCount: nearLimitCount,
                        allowanceCount: allowanceCount,
                        iCloudAvailable: health.iCloudAvailable
                    )
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 4, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                if !items.isEmpty {
                    Section {
                        Picker("Budget grouping", selection: Binding(
                            get: { BudgetGroupingMode(rawValue: groupingModeRaw) ?? .phase },
                            set: { newMode in
                                let oldMode = groupingMode
                                groupingModeRaw = newMode.rawValue
                                if newMode != oldMode {
                                    seedExpansion(for: newMode)
                                }
                            }
                        )) {
                            ForEach(BudgetGroupingMode.allCases) { mode in
                                Text(mode.rawValue).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                    }

                    Section {
                        healthFilterBar
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
                            .listRowBackground(Color.clear)
                    }
                }

                contentSections
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
                prompt: "Search cost code, item, category, notes"
            )
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    sortMenu
                }
            }
            .onAppear {
                seedExpansionOnFirstAppear()
                runRecalcIfNeeded()
            }
            .onChange(of: categories.map(\.name)) { _, names in
                // Only auto-expand newly added categories — never re-expand ones the user has
                // collapsed. Track which names we've already seeded.
                let new = Set(names).subtracting(seededCategoryNames)
                if !new.isEmpty {
                    expandedCategories.formUnion(new)
                    seededCategoryNames.formUnion(new)
                }
            }
            .onChange(of: initialSearchText) { _, newValue in
                searchText = newValue
                expandedCategories = Set(currentSectionTitles())
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

    // MARK: - Health filter bar

    private var healthFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(BudgetHealthFilter.allCases) { filter in
                    Button {
                        withAnimation(.smooth(duration: 0.2)) {
                            healthFilterRaw = filter.rawValue
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: filter.systemImage)
                                .font(.caption.weight(.bold))
                            Text(filter.title)
                                .font(.caption.weight(.bold))
                            Text("\(filterCount(filter))")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(healthFilter == filter ? .white.opacity(0.78) : .secondary)
                        }
                        .foregroundStyle(healthFilter == filter ? .white : .primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(healthFilter == filter ? filter.tint : AppTheme.surface, in: Capsule())
                        .overlay(
                            Capsule()
                                .strokeBorder(healthFilter == filter ? Color.clear : AppTheme.border, lineWidth: 0.75)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
        }
    }

    private func filterCount(_ filter: BudgetHealthFilter) -> Int {
        let scope = searchedItems
        switch filter {
        case .all: return scope.count
        case .overBudget, .nearLimit, .healthy: return scope.filter(filter.matches).count
        }
    }

    // MARK: - Content sections

    @ViewBuilder
    private var contentSections: some View {
        if items.isEmpty {
            emptyStateSection(
                title: "No budget items yet",
                subtitle: "Set up your build budget by adding cost codes for each scope of work.",
                action: ("Add first item", { showingAddItem = true })
            )
        } else if filteredItems.isEmpty {
            emptyStateSection(
                title: "No matches",
                subtitle: hasActiveFilters
                    ? "Clear the search or health filter to see all items."
                    : "Try a different filter.",
                action: ("Clear filters", { clearFilters() })
            )
        } else if groupingMode == .phase {
            ForEach(categories) { category in
                let raw = groupedItems[category.name, default: []]
                let categoryItems = sortedItems(raw)

                if !categoryItems.isEmpty {
                    budgetSection(
                        title: category.name,
                        systemImage: category.systemImage,
                        items: categoryItems
                    ) {
                        BudgetCategoryHeader(
                            category: category,
                            items: categoryItems,
                            isExpanded: expandedCategories.contains(category.name)
                        )
                    }
                }
            }
        } else {
            ForEach(visibleRooms, id: \.self) { room in
                let raw = groupedRoomItems[room, default: []]
                let roomItems = sortedItems(raw)

                if !roomItems.isEmpty {
                    budgetSection(
                        title: room,
                        systemImage: "square.grid.2x2",
                        items: roomItems
                    ) {
                        BudgetRoomHeader(
                            name: room,
                            items: roomItems,
                            photoCount: photoCount(forRoom: room),
                            isExpanded: expandedCategories.contains(room)
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func emptyStateSection(title: String, subtitle: String, action: (String, () -> Void)?) -> some View {
        Section {
            VStack(spacing: 12) {
                EmptyStateView(title: title, subtitle: subtitle, systemImage: "list.bullet.rectangle")
                if let action {
                    Button(action.0, action: action.1)
                        .buttonStyle(.borderedProminent)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
        }
    }

    private func budgetSection(
        title: String,
        systemImage _: String,
        items sectionItems: [BudgetLineItem],
        @ViewBuilder header: () -> some View
    ) -> some View {
        Section {
            if expandedCategories.contains(title) {
                ForEach(sectionItems) { item in
                    NavigationLink {
                        BudgetDetailView(item: item)
                    } label: {
                        BudgetLineRow(item: item, roomName: displayRoom(for: item))
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        Button {
                            Haptics.lightTap()
                            setPinned(!item.isPinned, forItemID: item.id)
                        } label: {
                            Label(item.isPinned ? "Unpin" : "Pin", systemImage: item.isPinned ? "pin.slash" : "pin")
                        }
                        .tint(AppTheme.accent)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            Haptics.lightTap()
                            deleteItem(withID: item.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                    .contextMenu {
                        Button {
                            Haptics.lightTap()
                            setPinned(!item.isPinned, forItemID: item.id)
                        } label: {
                            Label(item.isPinned ? "Unpin" : "Pin", systemImage: item.isPinned ? "pin.slash" : "pin")
                        }

                        Button {
                            Haptics.lightTap()
                            flagForReview(itemID: item.id)
                        } label: {
                            Label("Mark for review", systemImage: "flag")
                        }

                        Button(role: .destructive) {
                            Haptics.lightTap()
                            deleteItem(withID: item.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
                }
            }
        } header: {
            header()
                .contentShape(Rectangle())
                .onTapGesture {
                    withAnimation(.smooth(duration: 0.24)) {
                        toggle(title)
                    }
                }
        }
    }

    // MARK: - Sort menu

    private var sortMenu: some View {
        Menu {
            ForEach(BudgetSortField.allCases) { field in
                Button {
                    if sortField == field {
                        sortAscending.toggle()
                    } else {
                        sortFieldRaw = field.rawValue
                        sortAscending = field == .costCode // alphanumeric ascending by default; others usually descending
                            ? true
                            : false
                    }
                } label: {
                    Label(field.title, systemImage: sortField == field ? (sortAscending ? "arrow.up" : "arrow.down") : "")
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Sort budget items")
    }

    private func compare(_ lhs: BudgetLineItem, _ rhs: BudgetLineItem, by field: BudgetSortField) -> ComparisonResult {
        switch field {
        case .costCode:
            return lhs.costCode.localizedStandardCompare(rhs.costCode)
        case .budget:
            return compareCents(MoneyMath.cents(lhs.budget), MoneyMath.cents(rhs.budget))
        case .used:
            return compareCents(MoneyMath.cents(lhs.spentAndCommitted), MoneyMath.cents(rhs.spentAndCommitted))
        case .variance:
            return compareCents(MoneyMath.cents(lhs.variance), MoneyMath.cents(rhs.variance))
        case .utilization:
            if lhs.utilization == rhs.utilization { return .orderedSame }
            return lhs.utilization < rhs.utilization ? .orderedAscending : .orderedDescending
        }
    }

    private func compareCents(_ lhs: Int64, _ rhs: Int64) -> ComparisonResult {
        if lhs == rhs { return .orderedSame }
        return lhs < rhs ? .orderedAscending : .orderedDescending
    }

    // MARK: - Helpers

    private func currentSectionTitles() -> [String] {
        groupingMode == .phase ? categories.map(\.name) : visibleRooms
    }

    private func seedExpansionOnFirstAppear() {
        let titles = currentSectionTitles()
        if expandedCategories.isEmpty {
            expandedCategories = Set(titles)
        }
        seededCategoryNames.formUnion(titles)
    }

    private func seedExpansion(for mode: BudgetGroupingMode) {
        let titles = mode == .phase ? categories.map(\.name) : visibleRooms
        expandedCategories = Set(titles)
        if mode == .phase {
            seededCategoryNames = Set(categories.map(\.name))
        }
    }

    private func runRecalcIfNeeded() {
        if BudgetMathService.recalculateActuals(
            for: project.id,
            items: items,
            expenses: expenses,
            changeOrders: fetchChangeOrders(),
            allowanceSelections: allowanceSelections
        ) {
            saveChanges()
        }
    }

    private func displayRoom(for item: BudgetLineItem) -> String {
        let tag = item.roomTag.trimmed
        if !tag.isEmpty {
            return tag
        }
        return RoomCatalog.inferredRoom(title: item.title, category: item.categoryName, project: project)
    }

    private func photoCount(forRoom room: String) -> Int {
        photos.filter { photo in
            let tag = photo.roomTag.trimmed
            return !tag.isEmpty && tag.caseInsensitiveCompare(room) == .orderedSame
        }.count
    }

    private func toggle(_ categoryName: String) {
        if expandedCategories.contains(categoryName) {
            expandedCategories.remove(categoryName)
        } else {
            expandedCategories.insert(categoryName)
        }
    }

    private func clearFilters() {
        searchText = ""
        healthFilterRaw = BudgetHealthFilter.all.rawValue
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

    /// Append (or no-op) a "Needs review" marker on the item's notes. Idempotent: running it
    /// twice doesn't duplicate. Preserves existing notes by prefixing the marker.
    private func flagForReview(itemID: UUID) {
        guard let item = fetchItem(withID: itemID) else { return }
        let marker = "Needs review"
        if item.notes.localizedCaseInsensitiveContains(marker) {
            return // already flagged
        }
        item.notes = item.notes.trimmed.isEmpty ? marker : "\(marker) — \(item.notes.trimmed)"
        saveChanges()
    }

    private func deleteItem(withID itemID: UUID) {
        guard let item = fetchItem(withID: itemID) else { return }
        let changeOrders = fetchChangeOrders()
        let linkedExpenses = expenses.filter { $0.budgetLineItemID == item.id }.count
        let linkedPhotos = photos.filter { $0.budgetLineItemID == item.id }.count
        let linkedChangeOrders = changeOrders.filter { $0.budgetLineItemID == item.id }.count
        let linkedSelections = allowanceSelections.filter { $0.lineItemID == item.id }.count
        let linkedCount = linkedExpenses + linkedPhotos + linkedChangeOrders + linkedSelections

        guard linkedCount == 0 else {
            deleteBlockedMessage = "This item is linked to \(linkedExpenses) expenses, \(linkedPhotos) photos, \(linkedChangeOrders) change orders, and \(linkedSelections) allowance selections. Reassign or delete those records first so project totals stay accurate."
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
        MoneyMath.sum(items, by: \.budget)
    }

    private var actual: Double {
        MoneyMath.sum(items, by: \.actual)
    }

    private var committed: Double {
        MoneyMath.sum(items, by: \.openCommitment)
    }

    private var used: Double {
        MoneyMath.dollars(MoneyMath.cents(actual) + MoneyMath.cents(committed))
    }

    private var health: BudgetHealth {
        // Cent-exact thresholds so a 0.0000001 drift can't flip the bucket.
        let usedCents = MoneyMath.cents(used)
        let budgetCents = MoneyMath.cents(budget)
        if usedCents > budgetCents { return .overBudget }
        if budgetCents > 0, Double(usedCents) / Double(budgetCents) >= 0.9 { return .nearLimit }
        return .healthy
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

private struct BudgetRoomHeader: View {
    let name: String
    let items: [BudgetLineItem]
    let photoCount: Int
    let isExpanded: Bool

    private var budget: Double {
        MoneyMath.sum(items, by: \.budget)
    }

    private var used: Double {
        MoneyMath.sum(items, by: \.spentAndCommitted)
    }

    private var health: BudgetHealth {
        let usedCents = MoneyMath.cents(used)
        let budgetCents = MoneyMath.cents(budget)
        if usedCents > budgetCents { return .overBudget }
        if budgetCents > 0, Double(usedCents) / Double(budgetCents) >= 0.9 { return .nearLimit }
        return .healthy
    }

    private var utilization: Double {
        guard budget > 0 else { return 0 }
        return used / budget
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: "square.grid.2x2")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(AppTheme.healthColor(health))
                    .frame(width: 32, height: 32)
                    .background(AppTheme.healthColor(health).opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 4) {
                    Text(name)
                        .font(.headline.weight(.semibold))
                        .textCase(nil)
                        .foregroundStyle(.primary)

                    Text("\(used.compactCurrencyString) used of \(budget.compactCurrencyString)")
                        .font(.caption)
                        .textCase(nil)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if photoCount > 0 {
                    Label("\(photoCount)", systemImage: "photo")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }

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
    let nearLimitCount: Int
    let allowanceCount: Int
    let iCloudAvailable: Bool?

    private var tint: Color {
        if progress > 1 { return AppTheme.negative }
        if progress >= 0.9 { return AppTheme.warning }
        return AppTheme.accent
    }

    private var overallHealth: BudgetHealth {
        if progress > 1 { return .overBudget }
        if progress >= 0.9 { return .nearLimit }
        return .healthy
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

                    BudgetHealthPill(health: overallHealth)
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

                HStack(spacing: 8) {
                    Label(
                        remaining >= 0 ? "\(remaining.compactCurrencyString) remaining" : "\(abs(remaining).compactCurrencyString) over",
                        systemImage: remaining >= 0 ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(remaining >= 0 ? AppTheme.positive : AppTheme.negative)

                    Spacer()

                    backupBadge
                }
                .font(.caption.weight(.bold))

                if overBudgetCount > 0 || nearLimitCount > 0 || allowanceCount > 0 {
                    HStack(spacing: 12) {
                        if overBudgetCount > 0 {
                            chip(systemImage: "exclamationmark.triangle.fill", text: "\(overBudgetCount) over", tint: AppTheme.negative)
                        }
                        if nearLimitCount > 0 {
                            chip(systemImage: "flag.fill", text: "\(nearLimitCount) near", tint: AppTheme.warning)
                        }
                        if allowanceCount > 0 {
                            chip(systemImage: "list.bullet.rectangle", text: "\(allowanceCount) allowance", tint: AppTheme.info)
                        }
                        Spacer()
                    }
                    .font(.caption2.weight(.bold))
                }
            }
        }
    }

    @ViewBuilder
    private var backupBadge: some View {
        switch iCloudAvailable {
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

    private func chip(systemImage: String, text: String, tint: Color) -> some View {
        Label(text, systemImage: systemImage)
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.13), in: Capsule())
    }
}

private struct BudgetLineRow: View {
    let item: BudgetLineItem
    let roomName: String

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

                        if item.isAllowance {
                            Text("ALLOWANCE")
                                .font(.caption2.weight(.heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(AppTheme.info, in: Capsule())
                        }
                    }

                    Text(roomName.isEmpty ? item.categoryName : "\(item.categoryName) • \(roomName)")
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
