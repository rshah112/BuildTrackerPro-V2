import Foundation
import SwiftData

struct BidLine: Codable, Hashable, Identifiable {
    var id: UUID
    var title: String
    var amount: Double

    init(id: UUID = UUID(), title: String, amount: Double) {
        self.id = id
        self.title = title
        self.amount = amount
    }
}

@Model
final class Bid {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var packageID: UUID
    var vendorID: UUID?
    var vendorName: String
    var amount: Double
    @Attribute(.externalStorage) var fileData: Data?
    var fileName: String
    var notes: String
    var lineItems: [BidLine]
    var createdAt: Date
    var awardedAt: Date?

    init(
        id: UUID = UUID(),
        projectID: UUID,
        packageID: UUID,
        vendorID: UUID? = nil,
        vendorName: String = "",
        amount: Double,
        fileData: Data? = nil,
        fileName: String = "",
        notes: String = "",
        lineItems: [BidLine] = [],
        createdAt: Date = .now,
        awardedAt: Date? = nil
    ) {
        self.id = id
        self.projectID = projectID
        self.packageID = packageID
        self.vendorID = vendorID
        self.vendorName = vendorName
        self.amount = amount
        self.fileData = fileData
        self.fileName = fileName
        self.notes = notes
        self.lineItems = lineItems
        self.createdAt = createdAt
        self.awardedAt = awardedAt
    }
}
