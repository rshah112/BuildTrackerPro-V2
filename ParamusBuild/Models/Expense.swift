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

    // Cent-exact via MoneyMath so balance comparisons (`balanceDue > 0` in cash flow)
    // can't be fooled by a sub-cent IEEE 754 drift over many transactions.

    var balanceDue: Double {
        let due = MoneyMath.cents(amount) - MoneyMath.cents(effectiveAmountPaid)
        return MoneyMath.dollars(max(Int64(0), due))
    }

    var effectiveAmountPaid: Double {
        guard isPaid else { return 0 }
        let amountCents = MoneyMath.cents(amount)
        let paidCents = MoneyMath.cents(amountPaid)
        let bounded = min(amountCents, max(Int64(0), paidCents))
        return MoneyMath.dollars(bounded)
    }
}
