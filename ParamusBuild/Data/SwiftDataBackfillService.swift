import Foundation
import SwiftData

@MainActor
enum SwiftDataBackfillService {
    private static let roomTagBackfillKey = "HomeBuildProBackfilledRoomTags20260508"

    static func runIfNeeded(in context: ModelContext) {
        guard !UserDefaults.standard.bool(forKey: roomTagBackfillKey) else { return }

        backfillRoomTags(in: context)
        UserDefaults.standard.set(true, forKey: roomTagBackfillKey)
    }

    private static func backfillRoomTags(in context: ModelContext) {
        let projects = (try? context.fetch(FetchDescriptor<Project>())) ?? []
        let items = (try? context.fetch(FetchDescriptor<BudgetLineItem>())) ?? []
        let expenses = (try? context.fetch(FetchDescriptor<Expense>())) ?? []
        let photos = (try? context.fetch(FetchDescriptor<PhotoAttachment>())) ?? []

        let projectsByID = Dictionary(uniqueKeysWithValues: projects.map { ($0.id, $0) })
        let itemsByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })

        for item in items {
            guard let project = projectsByID[item.projectID] else { continue }
            item.roomTag = RoomCatalog.inferredRoom(title: item.title, category: item.categoryName, project: project)
        }

        for expense in expenses {
            guard let project = projectsByID[expense.projectID] else { continue }
            if let itemID = expense.budgetLineItemID, let item = itemsByID[itemID] {
                expense.roomTag = RoomCatalog.inferredRoom(title: item.title, category: item.categoryName, project: project)
            } else {
                let title = expense.budgetLineItemTitle.trimmed.isEmpty ? expense.vendorName : expense.budgetLineItemTitle
                expense.roomTag = RoomCatalog.inferredRoom(title: title, category: expense.categoryName, project: project)
            }
        }

        for photo in photos {
            guard let project = projectsByID[photo.projectID] else { continue }
            if let itemID = photo.budgetLineItemID, let item = itemsByID[itemID] {
                photo.roomTag = RoomCatalog.inferredRoom(title: item.title, category: item.categoryName, project: project)
            } else {
                photo.roomTag = RoomCatalog.inferredRoom(title: photo.notes, category: photo.categoryName, project: project)
            }
        }

        try? context.save()
    }
}
