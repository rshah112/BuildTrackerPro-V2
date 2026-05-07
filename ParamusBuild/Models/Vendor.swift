import Foundation
import SwiftData

@Model
final class Vendor {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var name: String
    var trade: String
    var phone: String
    var email: String
    var notes: String

    init(
        id: UUID = UUID(),
        projectID: UUID,
        name: String,
        trade: String,
        phone: String = "",
        email: String = "",
        notes: String = ""
    ) {
        self.id = id
        self.projectID = projectID
        self.name = name
        self.trade = trade
        self.phone = phone
        self.email = email
        self.notes = notes
    }
}
