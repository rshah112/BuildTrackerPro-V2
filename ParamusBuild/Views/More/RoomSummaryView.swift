import SwiftData
import SwiftUI

struct RoomSummaryView: View {
    let project: Project

    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private var summaries: [RoomSummary] {
        let allowedRooms = RoomCatalog.rooms(for: project)
        let itemRooms = Dictionary(uniqueKeysWithValues: items.map { ($0.id, roomName(for: $0)) })
        let usedRooms = Set(items.map(roomName(for:)) + expenses.map { roomName(for: $0, itemRooms: itemRooms) } + photos
            .map(roomName(for:)))
        let orderedRooms = allowedRooms.filter { usedRooms.contains($0) } + usedRooms
            .filter { !allowedRooms.contains($0) }
            .sorted { $0.localizedStandardCompare($1) == .orderedAscending }

        return orderedRooms.compactMap { room in
            let roomItems = items.filter { roomName(for: $0) == room }
            let roomExpenses = expenses.filter { roomName(for: $0, itemRooms: itemRooms) == room }
            let roomPhotos = photos.filter { roomName(for: $0) == room }
            let budget = roomItems.reduce(0) { $0 + $1.budget }
            let spent = roomItems.reduce(0) { $0 + $1.spentAndCommitted }
            guard budget > 0 || spent > 0 || !roomExpenses.isEmpty || !roomPhotos.isEmpty else { return nil }
            return RoomSummary(room: room, budget: budget, spent: spent, expenseCount: roomExpenses.count, photoCount: roomPhotos.count)
        }
    }

    var body: some View {
        List {
            if summaries.isEmpty {
                Section {
                    EmptyStateView(
                        title: "No Rooms Yet",
                        subtitle: "Budget items, expenses, and photos will appear here once they have a room or area.",
                        systemImage: "square.grid.2x2"
                    )
                    .listRowBackground(Color.clear)
                }
            } else {
                Section {
                    ForEach(summaries) { summary in
                        NavigationLink {
                            RoomDetailView(project: project, roomName: summary.room)
                        } label: {
                            RoomSummaryRow(summary: summary)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("By Room")
    }

    private func roomName(for item: BudgetLineItem) -> String {
        let tag = item.roomTag.trimmed
        if !tag.isEmpty { return tag }
        return RoomCatalog.inferredRoom(title: item.title, category: item.categoryName, project: project)
    }

    private func roomName(for expense: Expense, itemRooms: [UUID: String]) -> String {
        let tag = expense.roomTag.trimmed
        if !tag.isEmpty { return tag }
        if let itemID = expense.budgetLineItemID, let room = itemRooms[itemID] { return room }
        return RoomCatalog.inferredRoom(title: expense.budgetLineItemTitle, category: expense.categoryName, project: project)
    }

    private func roomName(for photo: PhotoAttachment) -> String {
        let tag = photo.roomTag.trimmed
        return tag.isEmpty ? RoomCatalog.general : tag
    }
}

private struct RoomDetailView: View {
    let project: Project
    let roomName: String

    @Query private var items: [BudgetLineItem]
    @Query private var expenses: [Expense]
    @Query private var photos: [PhotoAttachment]

    @State private var expenseIDToEdit: UUID?

    init(project: Project, roomName: String) {
        self.project = project
        self.roomName = roomName
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _expenses = Query(filter: #Predicate<Expense> { $0.projectID == projectID }, sort: \.date, order: .reverse)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private var itemRooms: [UUID: String] {
        Dictionary(uniqueKeysWithValues: items.map { ($0.id, resolvedRoom(for: $0)) })
    }

    private var roomItems: [BudgetLineItem] {
        items.filter { resolvedRoom(for: $0).caseInsensitiveCompare(roomName) == .orderedSame }
    }

    private var roomExpenses: [Expense] {
        expenses.filter { resolvedRoom(for: $0).caseInsensitiveCompare(roomName) == .orderedSame }
    }

    private var roomPhotos: [PhotoAttachment] {
        photos.filter { resolvedRoom(for: $0).caseInsensitiveCompare(roomName) == .orderedSame }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                roomHeader
                budgetSection
                expensesSection
                photosSection
            }
            .padding(AppTheme.pagePadding)
        }
        .background(AppTheme.pageBackground)
        .navigationTitle(roomName)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: expenseEditBinding) { route in
            AddExpenseView(project: project, expenseID: route.id)
        }
    }

    private var roomHeader: some View {
        PremiumCard {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "square.grid.2x2")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(AppTheme.accent)
                    .frame(width: 42, height: 42)
                    .background(AppTheme.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 6) {
                    Text(roomName)
                        .font(.title3.weight(.bold))
                    Text("\(roomItems.count) budget items • \(roomExpenses.count) expenses • \(roomPhotos.count) photos")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
        }
    }

    private var budgetSection: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Budget")
                    .font(.headline.weight(.semibold))

                if roomItems.isEmpty {
                    Text("No budget items in this room yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(roomItems) { item in
                        NavigationLink {
                            BudgetDetailView(item: item)
                        } label: {
                            RoomBudgetRow(item: item)
                        }
                        .buttonStyle(.plain)

                        if item.id != roomItems.last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private var expensesSection: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Expenses")
                    .font(.headline.weight(.semibold))

                if roomExpenses.isEmpty {
                    Text("No expenses in this room yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(roomExpenses) { expense in
                        Button {
                            expenseIDToEdit = expense.id
                        } label: {
                            RoomExpenseRow(expense: expense)
                        }
                        .buttonStyle(.plain)

                        if expense.id != roomExpenses.last?.id {
                            Divider()
                        }
                    }
                }
            }
        }
    }

    private var photosSection: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 12) {
                Text("Photos")
                    .font(.headline.weight(.semibold))

                if roomPhotos.isEmpty {
                    Text("No photos tagged to this room yet.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 10)], spacing: 10) {
                        ForEach(roomPhotos) { photo in
                            PhotoThumbnail(data: photo.imageData)
                                .frame(height: 110)
                        }
                    }
                }
            }
        }
    }

    private var expenseEditBinding: Binding<ExpenseEditRoute?> {
        Binding(
            get: { expenseIDToEdit.map(ExpenseEditRoute.init(id:)) },
            set: { route in expenseIDToEdit = route?.id }
        )
    }

    private func resolvedRoom(for item: BudgetLineItem) -> String {
        let tag = item.roomTag.trimmed
        if !tag.isEmpty { return tag }
        return RoomCatalog.inferredRoom(title: item.title, category: item.categoryName, project: project)
    }

    private func resolvedRoom(for expense: Expense) -> String {
        let tag = expense.roomTag.trimmed
        if !tag.isEmpty { return tag }
        if let itemID = expense.budgetLineItemID, let room = itemRooms[itemID] { return room }
        return RoomCatalog.inferredRoom(title: expense.budgetLineItemTitle, category: expense.categoryName, project: project)
    }

    private func resolvedRoom(for photo: PhotoAttachment) -> String {
        let tag = photo.roomTag.trimmed
        return tag.isEmpty ? RoomCatalog.general : tag
    }
}

private struct RoomSummary: Identifiable {
    let room: String
    let budget: Double
    let spent: Double
    let expenseCount: Int
    let photoCount: Int

    var id: String {
        room
    }
}

private struct ExpenseEditRoute: Identifiable {
    let id: UUID
}

private struct RoomSummaryRow: View {
    let summary: RoomSummary

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "square.grid.2x2")
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 36, height: 36)
                .background(AppTheme.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(summary.room)
                    .font(.subheadline.weight(.semibold))
                Text("\(summary.spent.compactCurrencyString) spent of \(summary.budget.compactCurrencyString)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Label("\(summary.photoCount)", systemImage: "photo")
                Label("\(summary.expenseCount)", systemImage: "receipt")
            }
            .font(.caption2.weight(.bold))
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 5)
    }
}

private struct RoomBudgetRow: View {
    let item: BudgetLineItem

    var body: some View {
        HStack(spacing: 12) {
            Text(item.costCode)
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.healthColor(item.health))
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(AppTheme.healthColor(item.health).opacity(0.12), in: RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(item.categoryName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(item.spentAndCommitted.compactCurrencyString)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(AppTheme.healthColor(item.health))
        }
        .padding(.vertical, 3)
    }
}

private struct RoomExpenseRow: View {
    let expense: Expense

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: expense.isPaid ? "checkmark.circle.fill" : "clock.badge.exclamationmark")
                .font(.headline.weight(.semibold))
                .foregroundStyle(expense.isPaid ? AppTheme.positive : AppTheme.warning)
                .frame(width: 34, height: 34)
                .background(
                    (expense.isPaid ? AppTheme.positive : AppTheme.warning).opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(expense.vendorName.trimmed.isEmpty ? "Expense" : expense.vendorName.trimmed)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(expense.date.shortDateString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text(expense.amount.currencyString)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.primary)
        }
        .padding(.vertical, 3)
    }
}
