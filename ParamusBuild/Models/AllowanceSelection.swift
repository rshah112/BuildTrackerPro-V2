import Foundation
import SwiftData

@Model
final class AllowanceSelection {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var lineItemID: UUID = UUID()
    var selectionDate: Date
    var vendor: String
    var amount: Double
    var notes: String
    @Attribute(.externalStorage) var photoData: Data?

    init(
        id: UUID = UUID(),
        projectID: UUID,
        lineItemID: UUID,
        selectionDate: Date = .now,
        vendor: String,
        amount: Double,
        notes: String = "",
        photoData: Data? = nil
    ) {
        self.id = id
        self.projectID = projectID
        self.lineItemID = lineItemID
        self.selectionDate = selectionDate
        self.vendor = vendor
        self.amount = amount
        self.notes = notes
        self.photoData = photoData
    }
}
