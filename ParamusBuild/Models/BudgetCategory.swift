import Foundation
import SwiftData

@Model
final class BudgetCategory {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var name: String
    var sortOrder: Int
    var targetBudget: Double
    var systemImage: String

    init(
        id: UUID = UUID(),
        projectID: UUID,
        name: String,
        sortOrder: Int,
        targetBudget: Double,
        systemImage: String
    ) {
        self.id = id
        self.projectID = projectID
        self.name = name
        self.sortOrder = sortOrder
        self.targetBudget = targetBudget
        self.systemImage = systemImage
    }
}
