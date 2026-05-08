import Foundation
import SwiftData

@Model
final class Expense {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var amount: Double
    var amountPaid: Double = 0
    var vendorName: String
    var invoiceNumber: String = ""
    var date: Date
    var dueDate: Date?
    var expectedPaymentDate: Date?
    var paidDate: Date?
    var paymentMethod: String = ""
    var paymentReference: String = ""
    var categoryName: String
    var roomTag: String = ""
    var budgetLineItemID: UUID?
    var budgetLineItemTitle: String
    var notes: String
    var isPaid: Bool
    @Attribute(.externalStorage) var receiptImageData: Data?

    init(
        id: UUID = UUID(),
        projectID: UUID,
        amount: Double,
        amountPaid: Double? = nil,
        vendorName: String,
        invoiceNumber: String = "",
        date: Date = .now,
        dueDate: Date? = nil,
        expectedPaymentDate: Date? = nil,
        paidDate: Date? = nil,
        paymentMethod: String = "",
        paymentReference: String = "",
        categoryName: String,
        roomTag: String = "",
        budgetLineItemID: UUID? = nil,
        budgetLineItemTitle: String = "",
        notes: String = "",
        isPaid: Bool = true,
        receiptImageData: Data? = nil
    ) {
        self.id = id
        self.projectID = projectID
        self.amount = amount
        self.amountPaid = amountPaid ?? (isPaid ? amount : 0)
        self.vendorName = vendorName
        self.invoiceNumber = invoiceNumber
        self.date = date
        self.dueDate = dueDate
        self.expectedPaymentDate = expectedPaymentDate
        self.paidDate = paidDate
        self.paymentMethod = paymentMethod
        self.paymentReference = paymentReference
        self.categoryName = categoryName
        self.roomTag = roomTag
        self.budgetLineItemID = budgetLineItemID
        self.budgetLineItemTitle = budgetLineItemTitle
        self.notes = notes
        self.isPaid = isPaid
        self.receiptImageData = receiptImageData
    }

    var balanceDue: Double {
        max(0, amount - effectiveAmountPaid)
    }

    var effectiveAmountPaid: Double {
        guard isPaid else { return 0 }
        return min(amount, max(0, amountPaid))
    }
}
