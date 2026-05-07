import Foundation
import SwiftData

@Model
final class PhotoAttachment {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    @Attribute(.externalStorage) var imageData: Data?
    var createdAt: Date
    var roomTag: String
    var phaseTag: String
    var categoryName: String
    var budgetLineItemID: UUID?
    var notes: String

    init(
        id: UUID = UUID(),
        projectID: UUID,
        imageData: Data? = nil,
        createdAt: Date = .now,
        roomTag: String = "",
        phaseTag: String = "",
        categoryName: String = "",
        budgetLineItemID: UUID? = nil,
        notes: String = ""
    ) {
        self.id = id
        self.projectID = projectID
        self.imageData = imageData
        self.createdAt = createdAt
        self.roomTag = roomTag
        self.phaseTag = phaseTag
        self.categoryName = categoryName
        self.budgetLineItemID = budgetLineItemID
        self.notes = notes
    }
}
