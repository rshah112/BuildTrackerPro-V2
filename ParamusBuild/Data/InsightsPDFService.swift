import Foundation
import UIKit

enum InsightsPDFService {
    static func createPDF(
        projects: [Project],
        items: [BudgetLineItem],
        expenses: [Expense],
        allowanceSelections: [AllowanceSelection] = [],
        changeOrders: [ChangeOrder]
    ) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("HomeBuildPro-Insights-\(timestamp()).pdf")
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
        let data = renderer.pdfData { context in
            context.beginPage()
            var y: CGFloat = 44
            draw("HomeBuild Pro Insights", x: 44, y: y, size: 24, weight: .bold)
            y += 34
            draw("Generated \(Date().formatted(date: .abbreviated, time: .shortened))", x: 44, y: y, size: 10, color: .secondaryLabel)
            y += 34

            draw("$/sqft by Project", x: 44, y: y, size: 16, weight: .bold)
            y += 24
            for row in InsightsMath.costPerSquareFootRows(
                projects: projects,
                items: items,
                expenses: expenses,
                allowanceSelections: allowanceSelections,
                changeOrders: changeOrders
            )
            .prefix(10) {
                guard ensureSpace(&y, context: context) else { continue }
                draw(row.projectName, x: 44, y: y, size: 10)
                draw(row.costPerSquareFoot.currencyString, x: 430, y: y, size: 10, alignment: .right)
                y += 18
            }

            y += 18
            draw("% per Phase Across Completed Projects", x: 44, y: y, size: 16, weight: .bold)
            y += 24
            for row in InsightsMath.phasePercentRows(projects: projects, items: items).prefix(12) {
                guard ensureSpace(&y, context: context) else { continue }
                draw(row.category, x: 44, y: y, size: 10)
                draw(row.percent.formatted(.number.precision(.fractionLength(1))) + "%", x: 430, y: y, size: 10, alignment: .right)
                y += 18
            }

            y += 18
            draw("Trend Over Time by Category", x: 44, y: y, size: 16, weight: .bold)
            y += 24
            for row in InsightsMath.categoryTrendRows(expenses: expenses).prefix(14) {
                guard ensureSpace(&y, context: context) else { continue }
                draw("\(row.monthLabel)  \(row.category)", x: 44, y: y, size: 10)
                draw(row.amount.currencyString, x: 430, y: y, size: 10, alignment: .right)
                y += 18
            }
        }
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func ensureSpace(_ y: inout CGFloat, context: UIGraphicsPDFRendererContext) -> Bool {
        if y < 744 { return true }
        context.beginPage()
        y = 44
        return true
    }

    private static func draw(
        _ text: String,
        x: CGFloat,
        y: CGFloat,
        size: CGFloat,
        weight: UIFont.Weight = .regular,
        color: UIColor = .label,
        alignment: NSTextAlignment = .left
    ) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = alignment
        let width: CGFloat = alignment == .right ? 130 : 390
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size, weight: weight),
            .foregroundColor: color,
            .paragraphStyle: paragraph
        ]
        text.draw(in: CGRect(x: x, y: y, width: width, height: size + 8), withAttributes: attributes)
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: Date())
    }
}
