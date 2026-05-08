import Foundation

enum CashFlowPaymentKind {
    case expense
    case changeOrder
}

enum CashFlowExposure {
    case committed
    case pending
}

struct CashFlowPayment: Identifiable {
    let id: String
    let sourceID: UUID
    let kind: CashFlowPaymentKind
    let exposure: CashFlowExposure
    let title: String
    let subtitle: String
    let amount: Double
    let expectedDate: Date
}

struct CashFlowDay: Identifiable {
    let id: Date
    let date: Date
    let payments: [CashFlowPayment]

    var committedTotal: Double {
        payments.filter { $0.exposure == .committed }.reduce(0) { $0 + $1.amount }
    }

    var pendingExposureTotal: Double {
        payments.filter { $0.exposure == .pending }.reduce(0) { $0 + $1.amount }
    }

    var total: Double {
        committedTotal + pendingExposureTotal
    }
}

enum CashFlowService {
    static let forecastDayCount = 14

    static func forecast(
        project: Project,
        expenses: [Expense],
        changeOrders: [ChangeOrder],
        today: Date = Date(),
        calendar: Calendar = .current
    ) -> [CashFlowDay] {
        let startOfToday = calendar.startOfDay(for: today)
        let horizonEnd = calendar.date(byAdding: .day, value: forecastDayCount, to: startOfToday) ?? startOfToday
        let payments = payments(
            project: project,
            expenses: expenses,
            changeOrders: changeOrders,
            today: startOfToday,
            horizonEnd: horizonEnd,
            calendar: calendar
        )

        return (0 ..< forecastDayCount).map { offset in
            let date = calendar.date(byAdding: .day, value: offset, to: startOfToday) ?? startOfToday
            let dayPayments = payments.filter { payment in
                calendar.isDate(payment.expectedDate, inSameDayAs: date)
            }
            return CashFlowDay(id: date, date: date, payments: dayPayments)
        }
    }

    static func nextFourteenDaysDueTotal(
        project: Project,
        expenses: [Expense],
        changeOrders: [ChangeOrder],
        today: Date = Date(),
        calendar: Calendar = .current
    ) -> Double {
        let start = calendar.startOfDay(for: today)
        let end = calendar.date(byAdding: .day, value: forecastDayCount, to: start) ?? start
        return payments(
            project: project,
            expenses: expenses,
            changeOrders: changeOrders,
            today: start,
            horizonEnd: end,
            calendar: calendar
        )
        .reduce(0) { $0 + $1.amount }
    }

    static func payments(
        project: Project,
        expenses: [Expense],
        changeOrders: [ChangeOrder],
        today: Date = Date(),
        horizonEnd: Date? = nil,
        calendar: Calendar = .current
    ) -> [CashFlowPayment] {
        let start = calendar.startOfDay(for: today)
        let end = horizonEnd ?? (calendar.date(byAdding: .day, value: forecastDayCount, to: start) ?? start)

        let expensePayments = expenses.compactMap { expense -> CashFlowPayment? in
            guard expense.projectID == project.id, expense.balanceDue > 0 else { return nil }
            guard let expectedDate = expense.expectedPaymentDate ?? expense.dueDate else { return nil }
            let day = calendar.startOfDay(for: expectedDate)
            guard day >= start, day < end else { return nil }
            return CashFlowPayment(
                id: "expense-\(expense.id.uuidString)",
                sourceID: expense.id,
                kind: .expense,
                exposure: .committed,
                title: expense.vendorName,
                subtitle: expense.invoiceNumber.trimmed.isEmpty ? expense.categoryName : "Inv \(expense.invoiceNumber)",
                amount: expense.balanceDue,
                expectedDate: day
            )
        }

        let changeOrderPayments = changeOrders.compactMap { order -> CashFlowPayment? in
            guard order.projectID == project.id, order.status != .paid, let expectedDate = order.expectedPaymentDate else { return nil }
            let day = calendar.startOfDay(for: expectedDate)
            guard day >= start, day < end else { return nil }
            return CashFlowPayment(
                id: "change-\(order.id.uuidString)",
                sourceID: order.id,
                kind: .changeOrder,
                exposure: order.status == .pending ? .pending : .committed,
                title: order.title,
                subtitle: order.status == .pending ? "Pending change" : "Approved change",
                amount: order.amount,
                expectedDate: day
            )
        }

        return (expensePayments + changeOrderPayments).sorted {
            if $0.expectedDate == $1.expectedDate {
                return $0.amount > $1.amount
            }
            return $0.expectedDate < $1.expectedDate
        }
    }
}
