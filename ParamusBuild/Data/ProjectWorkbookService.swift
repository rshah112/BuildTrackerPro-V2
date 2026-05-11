import Foundation
import SwiftData

enum ProjectWorkbookService {
    static func makeWorkbook(
        project: Project,
        items: [BudgetLineItem],
        expenses: [Expense],
        documents: [ProjectDocument],
        changeOrders: [ChangeOrder],
        vendors: [Vendor],
        photos: [PhotoAttachment],
        allowanceSelections: [AllowanceSelection] = []
    ) -> String {
        let sheets = [
            sheet(
                name: "Dashboard",
                rows: dashboardRows(
                    project: project,
                    items: items,
                    expenses: expenses,
                    changeOrders: changeOrders,
                    photos: photos,
                    documents: documents,
                    vendors: vendors,
                    allowanceSelections: allowanceSelections
                )
            ),
            sheet(name: "Project", rows: projectRows(project)),
            sheet(name: "Budget Categories", rows: categoryRows(items)),
            sheet(name: "Budget", rows: budgetRows(items)),
            sheet(name: "Allowances", rows: allowanceRows(items: items, selections: allowanceSelections)),
            sheet(name: "Expenses", rows: expenseRows(expenses)),
            sheet(name: "Change Orders", rows: changeOrderRows(changeOrders)),
            sheet(name: "Vendors", rows: vendorRows(vendors)),
            sheet(name: "Documents", rows: documentRows(documents)),
            sheet(name: "Photos", rows: photoRows(photos))
        ]

        return """
        <?xml version="1.0"?>
        <?mso-application progid="Excel.Sheet"?>
        <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
         xmlns:o="urn:schemas-microsoft-com:office:office"
         xmlns:x="urn:schemas-microsoft-com:office:excel"
         xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
        <Styles>
        <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#111827" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
        <Style ss:ID="Text"><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
        <Style ss:ID="Currency"><NumberFormat ss:Format="\(currencyFormat())"/></Style>
        <Style ss:ID="Number"><NumberFormat ss:Format="#,##0.00"/></Style>
        <Style ss:ID="Date"><NumberFormat ss:Format="mmm d, yyyy"/></Style>
        <Style ss:ID="Positive"><Font ss:Color="#15803D"/><NumberFormat ss:Format="\(currencyFormat())"/></Style>
        <Style ss:ID="Negative"><Font ss:Color="#B91C1C"/><NumberFormat ss:Format="\(currencyFormat())"/></Style>
        </Styles>
        \(sheets.joined(separator: "\n"))
        </Workbook>
        """
    }

    @MainActor
    static func importWorkbook(
        data: Data,
        project: Project,
        items: [BudgetLineItem],
        expenses: [Expense],
        changeOrders: [ChangeOrder],
        vendors: [Vendor],
        allowanceSelections: [AllowanceSelection] = [],
        context: ModelContext
    ) throws {
        // Real Excel files (.xlsx) use ZIP+deflate. We only support uncompressed
        // SpreadsheetML round-trips of our own export. If the bytes look like a
        // ZIP but we can't extract a workbook entry, surface a clear error.
        let zipSig: [UInt8] = [0x50, 0x4B, 0x03, 0x04]
        if data.starts(with: zipSig), WorkbookDataExtractor.workbookData(from: data) == nil {
            throw NSError(
                domain: "ProjectWorkbookService",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey:
                    "This .xlsx isn't a HomeBuild Pro export. Real Excel files aren't supported — export from HomeBuild Pro first."]
            )
        }
        let workbookData = WorkbookDataExtractor.workbookData(from: data) ?? data
        let workbook = try WorkbookXMLParser.parse(data: workbookData)
        importProject(workbook["Project"] ?? [], project: project)
        let importedItemIDMap = importBudget(workbook["Budget"] ?? [], project: project, items: items, context: context)
        let currentItems = fetchBudgetItems(for: project, context: context)
        importExpenses(
            workbook["Expenses"] ?? [],
            project: project,
            items: currentItems,
            expenses: expenses,
            importedItemIDMap: importedItemIDMap,
            context: context
        )
        importChangeOrders(
            workbook["Change Orders"] ?? [],
            project: project,
            items: currentItems,
            changeOrders: changeOrders,
            importedItemIDMap: importedItemIDMap,
            context: context
        )
        importAllowances(
            workbook["Allowances"] ?? [],
            project: project,
            items: currentItems,
            allowanceSelections: allowanceSelections,
            importedItemIDMap: importedItemIDMap,
            context: context
        )
        importVendors(workbook["Vendors"] ?? [], project: project, vendors: vendors, context: context)
        recalculateImportedBudget(for: project, context: context)
    }

    private static func importProject(_ rows: [[String]], project: Project) {
        for row in rows.dropFirst() where row.count >= 2 {
            let field = row[0]
            let value = row[1]
            switch field {
            case "Name": project.name = value
            case "Address": project.address = value
            case "Status": project.status = parseProjectStatus(value) ?? project.status
            case "Priority": project.priority = parseProjectPriority(value) ?? project.priority
            case "Project Type": project.templateType = ProjectTemplateType(rawValue: value) ?? project.templateType
            case "Start Date": project.startDate = parseDate(value)
            case "Target Finish": project.targetFinishDate = parseDate(value)
            case "Scope Summary": project.scopeSummary = value
            case "Warranty / Follow-Up": project.warrantyNotes = value
            case "Purchase Price": project.purchasePrice = Double(value) ?? project.purchasePrice
            case "Square Footage": project.squareFootage = Double(value)
            case "Lot Dimensions": project.lotDimensions = value
            case "Proposed Build Dimensions":
                project.proposedBuildDimensions = value
                project.footprint = value
            case "Stories": project.stories = Int(value) ?? project.stories
            case "Basement": project.basement = value
            case "Construction Budget": project.constructionBudget = Double(value) ?? project.constructionBudget
            case "Contingency": project.contingencyBudget = Double(value) ?? project.contingencyBudget
            default: break
            }
        }
    }

    private static func importBudget(
        _ rows: [[String]],
        project: Project,
        items: [BudgetLineItem],
        context: ModelContext
    ) -> [String: UUID] {
        let byID = Dictionary(uniqueKeysWithValues: items.map { ($0.id.uuidString, $0) })
        var importedItemIDMap: [String: UUID] = [:]

        for row in rows.dropFirst() {
            guard row.count >= 6 else { continue }
            let id = row[0]
            // Only reuse the source UUID if it already belongs to THIS project.
            // Cross-project imports get a fresh UUID to avoid the @Attribute(.unique) collision
            // and to keep the source project's data intact.
            let item = byID[id] ?? BudgetLineItem(projectID: project.id, costCode: row[1], title: row[3], categoryName: row[2], budget: 0)

            if byID[id] == nil {
                context.insert(item)
            }

            item.costCode = row[1]
            item.categoryName = row[2]
            item.title = row[3]
            item.budget = Double(row[4]) ?? item.budget
            item.committed = Double(row[5]) ?? item.committed
            item.notes = row.count > 6 ? row[6] : item.notes
            item.roomTag = row[safe: 12] ?? item.roomTag
            item.isAllowance = parseBool(row[safe: 10] ?? "") ?? item.isAllowance
            item.allowanceAmount = Double(row[safe: 11] ?? "") ?? item.allowanceAmount
            importedItemIDMap[id] = item.id
        }

        return importedItemIDMap
    }

    private static func importExpenses(
        _ rows: [[String]],
        project: Project,
        items: [BudgetLineItem],
        expenses: [Expense],
        importedItemIDMap: [String: UUID],
        context: ModelContext
    ) {
        let byID = Dictionary(uniqueKeysWithValues: expenses.map { ($0.id.uuidString, $0) })
        let itemsByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id.uuidString, $0) })

        for row in rows.dropFirst() {
            guard row.count >= 6 else { continue }
            let id = row[0]
            let sourceItemID = row[safe: 8] ?? ""
            let mappedItemID = importedItemIDMap[sourceItemID]?.uuidString ?? sourceItemID
            let item = itemsByID[mappedItemID]
            let categoryName = item?.categoryName ?? row[safe: 10] ?? "Unassigned"
            let expense = byID[id] ?? Expense(projectID: project.id, amount: 0, vendorName: "", categoryName: categoryName)

            if byID[id] == nil {
                context.insert(expense)
            }

            expense.date = parseDate(row[1]) ?? expense.date
            expense.vendorName = row[2]
            expense.invoiceNumber = row[3]
            expense.amount = max(0, Double(row[4]) ?? expense.amount)
            let paidValue = Double(row[5]) ?? expense.amountPaid
            expense.amountPaid = min(expense.amount, max(0, paidValue))
            expense.dueDate = parseDate(row[safe: 6] ?? "")
            expense.paidDate = parseDate(row[safe: 7] ?? "")
            expense.budgetLineItemID = item?.id
            expense.budgetLineItemTitle = item?.title ?? row[safe: 9] ?? ""
            expense.categoryName = categoryName
            expense.paymentMethod = row[safe: 11] ?? expense.paymentMethod
            expense.paymentReference = row[safe: 12] ?? expense.paymentReference
            expense.notes = row[safe: 13] ?? expense.notes
            expense.roomTag = row[safe: 16] ?? expense.roomTag
            expense.expectedPaymentDate = parseDate(row[safe: 17] ?? "")

            if let paidFlag = parseBool(row[safe: 14] ?? "") {
                expense.isPaid = paidFlag
                if paidFlag, expense.amountPaid <= 0 {
                    expense.amountPaid = expense.amount
                }
                if paidFlag, expense.paidDate == nil {
                    expense.paidDate = expense.date
                }
            } else {
                expense.isPaid = expense.balanceDue <= 0
            }
        }
    }

    private static func importChangeOrders(
        _ rows: [[String]],
        project: Project,
        items: [BudgetLineItem],
        changeOrders: [ChangeOrder],
        importedItemIDMap: [String: UUID],
        context: ModelContext
    ) {
        let byID = Dictionary(uniqueKeysWithValues: changeOrders.map { ($0.id.uuidString, $0) })
        let itemsByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id.uuidString, $0) })

        for row in rows.dropFirst() {
            guard row.count >= 7 else { continue }
            let sourceItemID = row[5]
            let mappedItemID = importedItemIDMap[sourceItemID]?.uuidString ?? sourceItemID
            let item = itemsByID[mappedItemID]
            let order = byID[row[0]] ?? ChangeOrder(projectID: project.id, title: row[2], amount: 0, status: .pending, categoryName: row[4])

            if byID[row[0]] == nil {
                context.insert(order)
            }

            order.createdAt = parseDate(row[1]) ?? order.createdAt
            order.title = row[2]
            order.amount = Double(row[3]) ?? order.amount
            order.categoryName = item?.categoryName ?? row[4]
            order.budgetLineItemID = item?.id
            order.budgetLineItemTitle = item?.title ?? row[6]
            if row.count > 7, let parsed = parseChangeOrderStatus(row[7]) {
                order.statusRawValue = parsed.rawValue
            }
            order.notes = row.count > 8 ? row[8] : order.notes
            order.expectedPaymentDate = parseDate(row[safe: 9] ?? "")
        }
    }

    private static func importAllowances(
        _ rows: [[String]],
        project: Project,
        items: [BudgetLineItem],
        allowanceSelections: [AllowanceSelection],
        importedItemIDMap: [String: UUID],
        context: ModelContext
    ) {
        let byID = Dictionary(uniqueKeysWithValues: allowanceSelections.map { ($0.id.uuidString, $0) })
        let itemsByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
        let itemsByCodeAndTitle = Dictionary(grouping: items) { item in
            "\(item.costCode.trimmed.localizedLowercase)|\(item.title.trimmed.localizedLowercase)"
        }

        for row in rows.dropFirst() {
            guard row.count >= 6 else { continue }
            let selectionID = row[0]
            let sourceItemID = row[safe: 9] ?? ""
            let mappedItemID = importedItemIDMap[sourceItemID]
            let codeTitleKey = "\(row[safe: 2]?.trimmed.localizedLowercase ?? "")|\(row[safe: 3]?.trimmed.localizedLowercase ?? "")"
            guard let lineItemID = mappedItemID ?? itemsByCodeAndTitle[codeTitleKey]?.first?.id,
                  let item = itemsByID[lineItemID]
            else { continue }

            item.isAllowance = true
            if let importedAllowanceAmount = Double(row[safe: 6] ?? ""), importedAllowanceAmount > 0 {
                item.allowanceAmount = importedAllowanceAmount
            } else if item.allowanceAmount <= 0 {
                item.allowanceAmount = item.budget
            }

            let selection = byID[selectionID] ?? AllowanceSelection(
                projectID: project.id,
                lineItemID: lineItemID,
                vendor: "",
                amount: 0
            )
            if byID[selectionID] == nil {
                context.insert(selection)
            }
            selection.projectID = project.id
            selection.lineItemID = lineItemID
            selection.selectionDate = parseDate(row[safe: 1] ?? "") ?? selection.selectionDate
            selection.vendor = row[safe: 4] ?? selection.vendor
            selection.amount = max(0, Double(row[safe: 5] ?? "") ?? selection.amount)
            selection.notes = row[safe: 8] ?? selection.notes
        }
    }

    private static func importVendors(_ rows: [[String]], project: Project, vendors: [Vendor], context: ModelContext) {
        let byID = Dictionary(uniqueKeysWithValues: vendors.map { ($0.id.uuidString, $0) })

        for row in rows.dropFirst() {
            guard row.count >= 3 else { continue }
            let vendor = byID[row[0]] ?? Vendor(projectID: project.id, name: row[1], trade: row[2])
            if byID[row[0]] == nil {
                context.insert(vendor)
            }

            vendor.name = row[1]
            vendor.trade = row[2]
            vendor.phone = row.count > 3 ? row[3] : vendor.phone
            vendor.email = row.count > 4 ? row[4] : vendor.email
            vendor.notes = row.count > 5 ? row[5] : vendor.notes
        }
    }

    @MainActor
    private static func recalculateImportedBudget(for project: Project, context: ModelContext) {
        let items = fetchBudgetItems(for: project, context: context)
        let projectID = project.id
        let expenses = (try? context.fetch(FetchDescriptor<Expense>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let changeOrders = (try? context.fetch(FetchDescriptor<ChangeOrder>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let allowanceSelections = (try? context
            .fetch(FetchDescriptor<AllowanceSelection>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        BudgetMathService.recalculateActuals(
            for: project.id,
            items: items,
            expenses: expenses,
            changeOrders: changeOrders,
            allowanceSelections: allowanceSelections
        )
    }

    @MainActor
    private static func fetchBudgetItems(for project: Project, context: ModelContext) -> [BudgetLineItem] {
        let projectID = project.id
        return (try? context.fetch(FetchDescriptor<BudgetLineItem>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
    }

    private static func sheet(name: String, rows: [[Cell]]) -> String {
        """
        <Worksheet ss:Name="\(escape(name))">
        <Table ss:DefaultRowHeight="18">
        \(rows.enumerated().map { index, row in
            "<Row>\(row.map { $0.xml(header: index == 0) }.joined())</Row>"
        }.joined(separator: "\n"))
        </Table>
        </Worksheet>
        """
    }

    private static func dashboardRows(
        project: Project,
        items: [BudgetLineItem],
        expenses: [Expense],
        changeOrders: [ChangeOrder],
        photos: [PhotoAttachment],
        documents: [ProjectDocument],
        vendors: [Vendor],
        allowanceSelections: [AllowanceSelection]
    ) -> [[Cell]] {
        let constructionItems = items.filter { !isContingency($0.categoryName) }
        let constructionExpenses = expenses.filter { !isContingency($0.categoryName) }
        let constructionChangeOrders = changeOrders.filter { !isContingency($0.categoryName) }
        let constructionItemIDs = Set(constructionItems.map(\.id))
        let constructionAllowanceSelections = allowanceSelections.filter { constructionItemIDs.contains($0.lineItemID) }
        let actual = BudgetMathService.actualSpend(
            items: constructionItems,
            expenses: constructionExpenses,
            allowanceSelections: constructionAllowanceSelections,
            changeOrders: constructionChangeOrders
        )
        let paid = BudgetMathService.cashPaidTotal(expenses: constructionExpenses, changeOrders: constructionChangeOrders)
        let committed = BudgetMathService.committedSpend(items: constructionItems, changeOrders: constructionChangeOrders)
        let remaining = project.constructionBudget - actual - committed
        let contingencyItems = items
            .filter { isContingency($0.categoryName) }
            .reduce(0) { $0 + $1.spentAndCommitted }
        let approvedChanges = changeOrders
            .filter { $0.status == .approved || $0.status == .paid }
            .reduce(0) { $0 + $1.amount }
        let contingencyRemaining = project.contingencyBudget - contingencyItems - approvedChanges
        let openInvoices = expenses.reduce(0) { $0 + $1.balanceDue }
        let pendingChanges = BudgetMathService.pendingExposure(changeOrders: constructionChangeOrders)
        let allowanceOverage = BudgetMathService.allowanceOverage(
            items: constructionItems,
            allowanceSelections: constructionAllowanceSelections
        )

        return [
            [.text("Metric"), .text("Value")],
            [.text("Project"), .text(project.name)],
            [.text("Address"), .text(project.address)],
            [.text("Status"), .text(project.status.title)],
            [.text("Priority"), .text(project.priority.title)],
            [.text("Project Budget"), .currency(project.constructionBudget)],
            [.text("Reserve / Contingency"), .currency(project.contingencyBudget)],
            [.text("Actual Spend"), .currency(actual)],
            [.text("Cash Paid"), .currency(paid)],
            [.text("Committed Spend"), .currency(committed)],
            [.text("Remaining Budget"), remaining >= 0 ? .positiveCurrency(remaining) : .negativeCurrency(remaining)],
            [
                .text("Contingency Remaining"),
                contingencyRemaining >= 0 ? .positiveCurrency(contingencyRemaining) : .negativeCurrency(contingencyRemaining)
            ],
            [.text("Open Invoices"), .currency(openInvoices)],
            [.text("Pending Change Exposure"), .currency(pendingChanges)],
            [.text("Allowance Overage"), .currency(allowanceOverage)],
            [.text("Budget Items"), .number(Double(items.count))],
            [.text("Expenses"), .number(Double(expenses.count))],
            [.text("Photos"), .number(Double(photos.count))],
            [.text("Documents"), .number(Double(documents.count))],
            [.text("Vendors"), .number(Double(vendors.count))],
            [.text("Change Orders"), .number(Double(changeOrders.count))]
        ]
    }

    private static func projectRows(_ project: Project) -> [[Cell]] {
        [
            [.text("Field"), .text("Value")],
            [.text("Name"), .text(project.name)],
            [.text("Address"), .text(project.address)],
            [.text("Status"), .text(project.status.title)],
            [.text("Priority"), .text(project.priority.title)],
            [.text("Project Type"), .text(project.templateType.rawValue)],
            [.text("Start Date"), .optionalDate(project.startDate)],
            [.text("Target Finish"), .optionalDate(project.targetFinishDate)],
            [.text("Scope Summary"), .text(project.scopeSummary)],
            [.text("Warranty / Follow-Up"), .text(project.warrantyNotes)],
            [.text("Purchase Price"), .currency(project.purchasePrice)],
            [.text("Square Footage"), project.squareFootage.map { .number($0) } ?? .text("")],
            [.text("Lot Dimensions"), .text(project.lotDimensions)],
            [.text("Proposed Build Dimensions"), .text(project.proposedBuildDimensions)],
            [.text("Stories"), .number(Double(project.stories))],
            [.text("Basement"), .text(project.basement)],
            [.text("Construction Budget"), .currency(project.constructionBudget)],
            [.text("Contingency"), .currency(project.contingencyBudget)]
        ]
    }

    private static func categoryRows(_ items: [BudgetLineItem]) -> [[Cell]] {
        let grouped = Dictionary(grouping: items, by: \.categoryName)
        let rows = grouped.keys.sorted { $0.localizedStandardCompare($1) == .orderedAscending }.map { category -> [Cell] in
            let categoryItems = grouped[category, default: []]
            let budget = categoryItems.reduce(0) { $0 + $1.budget }
            let actual = categoryItems.reduce(0) { $0 + $1.actual }
            let committed = categoryItems.reduce(0) { $0 + $1.committed }
            let openCommitment = categoryItems.reduce(0) { $0 + $1.openCommitment }
            let remaining = budget - actual - openCommitment
            return [
                .text(category),
                .number(Double(categoryItems.count)),
                .currency(budget),
                .currency(actual),
                .currency(committed),
                remaining >= 0 ? .positiveCurrency(remaining) : .negativeCurrency(remaining)
            ]
        }

        return [[.text("Category"), .text("Items"), .text("Budget"), .text("Actual"), .text("Committed"), .text("Remaining")]] + rows
    }

    private static func budgetRows(_ items: [BudgetLineItem]) -> [[Cell]] {
        [[
            .text("ID"),
            .text("Cost Code"),
            .text("Category"),
            .text("Title"),
            .text("Budget"),
            .text("Committed"),
            .text("Notes"),
            .text("Actual"),
            .text("Remaining"),
            .text("Variance"),
            .text("Allowance?"),
            .text("Allowance Amount"),
            .text("Room")
        ]]
            + items.map {
                let remaining = $0.remaining
                return [
                    .text($0.id.uuidString),
                    .text($0.costCode),
                    .text($0.categoryName),
                    .text($0.title),
                    .currency($0.budget),
                    .currency($0.committed),
                    .text($0.notes),
                    .currency($0.actual),
                    remaining >= 0 ? .positiveCurrency(remaining) : .negativeCurrency(remaining),
                    .currency($0.variance),
                    .text($0.isAllowance ? "Yes" : "No"),
                    .currency($0.allowanceAmount),
                    .text($0.roomTag)
                ]
            }
    }

    private static func allowanceRows(items: [BudgetLineItem], selections: [AllowanceSelection]) -> [[Cell]] {
        let itemsByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
        let header: [[Cell]] = [[
            .text("Selection ID"),
            .text("Date"),
            .text("Cost Code"),
            .text("Budget Item"),
            .text("Vendor"),
            .text("Amount"),
            .text("Allowance Amount"),
            .text("Line Overage"),
            .text("Notes"),
            .text("Budget Item ID")
        ]]

        let rows = selections.sorted { $0.selectionDate < $1.selectionDate }.map { selection -> [Cell] in
            let item = itemsByID[selection.lineItemID]
            let lineActual = item.map { BudgetMathService.allowanceSelectionTotal(for: $0, selections: selections) } ?? selection.amount
            let lineOverage = item.map { max(0, lineActual - $0.allowanceAmount) } ?? 0
            return [
                .text(selection.id.uuidString),
                .date(selection.selectionDate),
                .text(item?.costCode ?? ""),
                .text(item?.title ?? "Unknown allowance"),
                .text(selection.vendor),
                .currency(selection.amount),
                .currency(item?.allowanceAmount ?? 0),
                lineOverage > 0 ? .negativeCurrency(lineOverage) : .currency(0),
                .text(selection.notes),
                .text(selection.lineItemID.uuidString)
            ]
        }

        return header + rows
    }

    private static func expenseRows(_ expenses: [Expense]) -> [[Cell]] {
        [[
            .text("ID"),
            .text("Date"),
            .text("Vendor"),
            .text("Invoice #"),
            .text("Amount"),
            .text("Amount Paid"),
            .text("Due Date"),
            .text("Paid Date"),
            .text("Budget Item ID"),
            .text("Budget Item"),
            .text("Category"),
            .text("Payment Method"),
            .text("Payment Reference"),
            .text("Notes"),
            .text("Paid?"),
            .text("Balance Due"),
            .text("Room"),
            .text("Expected Payment Date")
        ]]
            + expenses.map { [
                .text($0.id.uuidString),
                .date($0.date),
                .text($0.vendorName),
                .text($0.invoiceNumber),
                .currency($0.amount),
                .currency($0.amountPaid),
                .optionalDate($0.dueDate),
                .optionalDate($0.paidDate),
                .text($0.budgetLineItemID?.uuidString ?? ""),
                .text($0.budgetLineItemTitle),
                .text($0.categoryName),
                .text($0.paymentMethod),
                .text($0.paymentReference),
                .text($0.notes),
                .text($0.isPaid ? "Yes" : "No"),
                .currency($0.balanceDue),
                .text($0.roomTag),
                .optionalDate($0.expectedPaymentDate)
            ] }
    }

    private static func changeOrderRows(_ orders: [ChangeOrder]) -> [[Cell]] {
        [[
            .text("ID"),
            .text("Date"),
            .text("Title"),
            .text("Amount"),
            .text("Category"),
            .text("Budget Item ID"),
            .text("Budget Item"),
            .text("Status"),
            .text("Notes"),
            .text("Expected Payment Date")
        ]]
            + orders.map { [
                .text($0.id.uuidString),
                .date($0.createdAt),
                .text($0.title),
                .currency($0.amount),
                .text($0.categoryName),
                .text($0.budgetLineItemID?.uuidString ?? ""),
                .text($0.budgetLineItemTitle),
                .text($0.status.rawValue),
                .text($0.notes),
                .optionalDate($0.expectedPaymentDate)
            ] }
    }

    private static func vendorRows(_ vendors: [Vendor]) -> [[Cell]] {
        [[.text("ID"), .text("Name"), .text("Trade"), .text("Phone"), .text("Email"), .text("Notes")]]
            + vendors.map { [.text($0.id.uuidString), .text($0.name), .text($0.trade), .text($0.phone), .text($0.email), .text($0.notes)] }
    }

    private static func documentRows(_ documents: [ProjectDocument]) -> [[Cell]] {
        [[.text("ID"), .text("File Name"), .text("Type"), .text("Status"), .text("Budget Item"), .text("Uploaded"), .text("Notes")]]
            + documents.map { [
                .text($0.id.uuidString),
                .text($0.fileName),
                .text($0.kind.title),
                .text($0.status.title),
                .text($0.budgetLineItemTitle),
                .date($0.uploadedAt),
                .text($0.notes)
            ] }
    }

    private static func photoRows(_ photos: [PhotoAttachment]) -> [[Cell]] {
        [[.text("ID"), .text("Created"), .text("Room"), .text("Photo Folder"), .text("Budget Category"), .text("Notes")]]
            + photos.map { [
                .text($0.id.uuidString),
                .date($0.createdAt),
                .text($0.roomTag),
                .text($0.phaseTag),
                .text($0.categoryName),
                .text($0.notes)
            ] }
    }

    private static func parseDate(_ value: String) -> Date? {
        guard !value.trimmed.isEmpty else { return nil }
        if let date = workbookISOFormatter.date(from: value) {
            return date
        }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")

        for format in ["yyyy-MM-dd", "M/d/yyyy", "M/d/yy", "MMM d, yyyy"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: value.trimmed) {
                return date
            }
        }

        return nil
    }

    private static func parseProjectStatus(_ value: String) -> ProjectStatus? {
        ProjectStatus.allCases.first {
            $0.rawValue.caseInsensitiveCompare(value.trimmed) == .orderedSame ||
                $0.title.caseInsensitiveCompare(value.trimmed) == .orderedSame
        }
    }

    private static func parseProjectPriority(_ value: String) -> ProjectPriority? {
        ProjectPriority.allCases.first {
            $0.rawValue.caseInsensitiveCompare(value.trimmed) == .orderedSame ||
                $0.title.caseInsensitiveCompare(value.trimmed) == .orderedSame
        }
    }

    private static func parseChangeOrderStatus(_ value: String) -> ChangeOrderStatus? {
        ChangeOrderStatus.allCases.first {
            $0.rawValue.caseInsensitiveCompare(value.trimmed) == .orderedSame ||
                $0.title.caseInsensitiveCompare(value.trimmed) == .orderedSame
        }
    }

    private static func parseBool(_ value: String) -> Bool? {
        switch value.trimmed.localizedLowercase {
        case "yes", "true", "paid", "1": true
        case "no", "false", "open", "unpaid", "0": false
        default: nil
        }
    }

    private static func isContingency(_ categoryName: String) -> Bool {
        categoryName.trimmed.caseInsensitiveCompare("Contingency") == .orderedSame
    }

    fileprivate static func currencyFormat() -> String {
        AppCurrencyPreferences.showCents
            ? "$#,##0.00;[Red]($#,##0.00)"
            : "$#,##0;[Red]($#,##0)"
    }

    fileprivate static func escape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

private let workbookISOFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = TimeZone(identifier: "UTC")
    return formatter
}()

private enum Cell {
    case text(String)
    case number(Double)
    case currency(Double)
    case positiveCurrency(Double)
    case negativeCurrency(Double)
    case date(Date)
    case optionalDate(Date?)

    func xml(header: Bool) -> String {
        let headerStyle = header ? " ss:StyleID=\"Header\"" : nil
        switch self {
        case let .text(value):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Text\"")><Data ss:Type=\"String\">\(ProjectWorkbookService.escape(value))</Data></Cell>"
        case let .number(value):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Number\"")><Data ss:Type=\"Number\">\(String(format: "%.2f", value))</Data></Cell>"
        case let .currency(value):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Currency\"")><Data ss:Type=\"Number\">\(String(format: "%.2f", value))</Data></Cell>"
        case let .positiveCurrency(value):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Positive\"")><Data ss:Type=\"Number\">\(String(format: "%.2f", value))</Data></Cell>"
        case let .negativeCurrency(value):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Negative\"")><Data ss:Type=\"Number\">\(String(format: "%.2f", value))</Data></Cell>"
        case let .date(date):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Date\"")><Data ss:Type=\"String\">\(workbookISOFormatter.string(from: date))</Data></Cell>"
        case let .optionalDate(date):
            return "<Cell\(headerStyle ?? " ss:StyleID=\"Date\"")><Data ss:Type=\"String\">\(date.map { workbookISOFormatter.string(from: $0) } ?? "")</Data></Cell>"
        }
    }
}

private extension [String] {
    subscript(safe index: Int) -> String? {
        indices.contains(index) ? self[index] : nil
    }
}

private enum WorkbookDataExtractor {
    static func workbookData(from data: Data) -> Data? {
        guard data.starts(with: [0x50, 0x4B, 0x03, 0x04]) else { return nil }

        var offset = 0
        while offset + 30 <= data.count {
            guard data.uint32LE(at: offset) == 0x0403_4B50 else { break }

            let compressionMethod = data.uint16LE(at: offset + 8)
            let compressedSize = Int(data.uint32LE(at: offset + 18))
            let fileNameLength = Int(data.uint16LE(at: offset + 26))
            let extraLength = Int(data.uint16LE(at: offset + 28))
            let nameStart = offset + 30
            let nameEnd = nameStart + fileNameLength
            let dataStart = nameEnd + extraLength
            let dataEnd = dataStart + compressedSize

            guard nameEnd <= data.count, dataEnd <= data.count else { return nil }

            let nameData = data.subdata(in: nameStart ..< nameEnd)
            let fileName = String(data: nameData, encoding: .utf8) ?? ""

            if compressionMethod == 0,
               fileName.hasPrefix("Data/"),
               fileName.localizedCaseInsensitiveContains("Workbook"),
               fileName.localizedCaseInsensitiveContains(".xls")
            {
                return data.subdata(in: dataStart ..< dataEnd)
            }

            offset = dataEnd
        }

        return nil
    }
}

private extension Data {
    func uint16LE(at offset: Int) -> UInt16 {
        guard offset + 2 <= count else { return 0 }
        return UInt16(self[offset]) | (UInt16(self[offset + 1]) << 8)
    }

    func uint32LE(at offset: Int) -> UInt32 {
        guard offset + 4 <= count else { return 0 }
        return UInt32(self[offset])
            | (UInt32(self[offset + 1]) << 8)
            | (UInt32(self[offset + 2]) << 16)
            | (UInt32(self[offset + 3]) << 24)
    }
}

private final class WorkbookXMLParser: NSObject, XMLParserDelegate {
    private var workbook: [String: [[String]]] = [:]
    private var currentSheet = ""
    private var currentRow: [String] = []
    private var currentValue = ""
    private var isInData = false

    static func parse(data: Data) throws -> [String: [[String]]] {
        let parser = WorkbookXMLParser()
        let xmlParser = XMLParser(data: data)
        xmlParser.delegate = parser
        guard xmlParser.parse() else {
            throw xmlParser.parserError ?? CocoaError(.fileReadCorruptFile)
        }
        return parser.workbook
    }

    func parser(
        _ parser: XMLParser,
        didStartElement elementName: String,
        namespaceURI: String?,
        qualifiedName qName: String?,
        attributes attributeDict: [String: String] = [:]
    ) {
        switch elementName {
        case "Worksheet":
            currentSheet = attributeDict["ss:Name"] ?? attributeDict["Name"] ?? ""
            workbook[currentSheet] = []
        case "Row":
            currentRow = []
        case "Data":
            currentValue = ""
            isInData = true
        default:
            break
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if isInData {
            currentValue += string
        }
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        switch elementName {
        case "Data":
            currentRow.append(currentValue)
            isInData = false
        case "Row":
            workbook[currentSheet, default: []].append(currentRow)
        default:
            break
        }
    }
}
