import Foundation

final class ExpenseFormViewModel: ObservableObject {
    @Published var amountText = ""
    @Published var amountPaidText = ""
    @Published var vendorName = ""
    @Published var invoiceNumber = ""
    @Published var date = Date()
    @Published var dueDate = Date()
    @Published var hasDueDate = false
    @Published var paidDate = Date()
    @Published var hasPaidDate = false
    @Published var paymentMethod = ""
    @Published var paymentReference = ""
    @Published var budgetLineItemID: UUID?
    @Published var notes = ""
    @Published var isPaid = true
    @Published var receiptImageData: Data?

    init(expense: Expense? = nil) {
        if let expense {
            load(from: expense)
        }
    }

    func load(from expense: Expense) {
        amountText = formatAmount(expense.amount)
        amountPaidText = formatAmount(expense.amountPaid)
        vendorName = expense.vendorName
        invoiceNumber = expense.invoiceNumber
        date = expense.date
        dueDate = Date()
        hasDueDate = false
        if let dueDate = expense.dueDate {
            self.dueDate = dueDate
            hasDueDate = true
        }
        paidDate = Date()
        hasPaidDate = false
        if let paidDate = expense.paidDate {
            self.paidDate = paidDate
            hasPaidDate = true
        }
        paymentMethod = expense.paymentMethod
        paymentReference = expense.paymentReference
        budgetLineItemID = expense.budgetLineItemID
        notes = expense.notes
        isPaid = expense.isPaid
        receiptImageData = expense.receiptImageData
    }

    var amount: Double {
        parseCurrency(amountText)
    }

    var amountPaid: Double {
        if amountPaidText.trimmed.isEmpty {
            return isPaid ? amount : 0
        }

        return min(amount, max(0, parseCurrency(amountPaidText)))
    }

    var canSave: Bool {
        amount > 0 && !vendorName.trimmed.isEmpty && budgetLineItemID != nil
    }

    func makeExpense(projectID: UUID, for item: BudgetLineItem?) -> Expense {
        Expense(
            projectID: projectID,
            amount: amount,
            amountPaid: amountPaid,
            vendorName: vendorName.trimmed,
            invoiceNumber: invoiceNumber.trimmed,
            date: date,
            dueDate: hasDueDate ? dueDate : nil,
            paidDate: isPaid ? (hasPaidDate ? paidDate : Date()) : nil,
            paymentMethod: paymentMethod.trimmed,
            paymentReference: paymentReference.trimmed,
            categoryName: item?.categoryName ?? "Unassigned",
            budgetLineItemID: item?.id,
            budgetLineItemTitle: item?.title ?? "",
            notes: notes.trimmed,
            isPaid: isPaid,
            receiptImageData: receiptImageData
        )
    }

    func apply(to expense: Expense, projectID: UUID, for item: BudgetLineItem?) {
        expense.projectID = projectID
        expense.amount = amount
        expense.amountPaid = amountPaid
        expense.vendorName = vendorName.trimmed
        expense.invoiceNumber = invoiceNumber.trimmed
        expense.date = date
        expense.dueDate = hasDueDate ? dueDate : nil
        expense.paidDate = isPaid ? (hasPaidDate ? paidDate : expense.paidDate) : nil
        expense.paymentMethod = paymentMethod.trimmed
        expense.paymentReference = paymentReference.trimmed
        if let item {
            expense.categoryName = item.categoryName
            expense.budgetLineItemID = item.id
            expense.budgetLineItemTitle = item.title
        }
        expense.notes = notes.trimmed
        expense.isPaid = isPaid
        expense.receiptImageData = receiptImageData
    }

    private func parseCurrency(_ value: String) -> Double {
        let cleaned = value
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: "")
        return Double(cleaned.trimmed) ?? 0
    }

    private func formatAmount(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        if abs(rounded - rounded.rounded()) < 0.005 {
            return String(format: "%.0f", rounded)
        }
        return String(format: "%.2f", rounded)
    }
}
