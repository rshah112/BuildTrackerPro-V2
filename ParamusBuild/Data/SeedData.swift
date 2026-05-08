import Foundation
import SwiftData
import UIKit

enum SeedData {
    @MainActor
    static func ensureSeeded(in context: ModelContext) {
        let descriptor = FetchDescriptor<Project>()
        let existingProjects = (try? context.fetch(descriptor)) ?? []
        guard existingProjects.isEmpty else {
            repairProjectScope(existingProjects, in: context)
            #if DEBUG
                if shouldSeedWorkflowSamples {
                    ensureWorkflowSampleProjects(existingProjects: existingProjects, in: context)
                }
            #endif
            return
        }

        let project = Project(
            name: "676 Rutgers Pl",
            address: "676 Rutgers Pl, Paramus NJ",
            status: .active,
            priority: .high,
            purchasePrice: 925_000,
            lotDimensions: "75 x 125",
            proposedBuildDimensions: "70 x 48",
            footprint: "70 x 48 footprint",
            stories: 2,
            basement: "Unfinished basement",
            scopeSummary: "Luxury two-story custom home with unfinished basement, premium finishes and full site improvements.",
            warrantyNotes: "Track punch-list and warranty follow-ups after final handover.",
            startDate: daysAgo(45),
            targetFinishDate: daysFromNow(210),
            constructionBudget: 1_300_000,
            contingencyBudget: 200_000
        )
        context.insert(project)

        let insertedItems = seedBudgetTemplate(for: project, in: context, includeProgress: true)

        vendors(for: project.id).forEach { context.insert($0) }

        for expense in sampleExpenses(projectID: project.id, using: insertedItems) {
            context.insert(expense)
        }

        for photo in samplePhotos(projectID: project.id, using: insertedItems) {
            context.insert(photo)
        }

        sampleChangeOrders(projectID: project.id).forEach { context.insert($0) }
        sampleDocuments(projectID: project.id).forEach { context.insert($0) }

        #if DEBUG
            if shouldSeedWorkflowSamples {
                ensureWorkflowSampleProjects(existingProjects: [project], in: context)
            }
        #endif
        recalculateProjects(in: context)
        try? context.save()
    }

    @discardableResult
    @MainActor
    static func seedBudgetTemplate(for project: Project, in context: ModelContext, includeProgress: Bool) -> [String: BudgetLineItem] {
        var insertedItems: [String: BudgetLineItem] = [:]

        for (index, category) in categorySeeds.enumerated() {
            context.insert(
                BudgetCategory(
                    projectID: project.id,
                    name: category.name,
                    sortOrder: index,
                    targetBudget: category.totalBudget,
                    systemImage: category.systemImage
                )
            )

            for seed in category.items {
                let item = BudgetLineItem(
                    projectID: project.id,
                    costCode: seed.costCode,
                    title: seed.title,
                    categoryName: category.name,
                    budget: seed.budget,
                    actual: includeProgress ? seed.actual : 0,
                    committed: includeProgress ? seed.committed : 0,
                    notes: seed.notes,
                    isPinned: includeProgress && seed.isPinned
                )
                insertedItems[seed.costCode] = item
                context.insert(item)
            }
        }
        return insertedItems
    }

    @MainActor
    private static func repairProjectScope(_ projects: [Project], in context: ModelContext) {
        let validIDs = Set(projects.map(\.id))

        for project in projects {
            if project.proposedBuildDimensions.isEmpty {
                project.proposedBuildDimensions = project.footprint
            }

            if project.scopeSummary.isEmpty, !project.proposedBuildDimensions.isEmpty {
                project.scopeSummary = project.proposedBuildDimensions
            }
        }

        // Delete orphaned children whose project no longer exists, rather than relocating them
        // to an arbitrary "primary" project (which silently corrupts another project).
        deleteOrphans(BudgetCategory.self, validIDs: validIDs, in: context)
        deleteOrphans(BudgetLineItem.self, validIDs: validIDs, in: context)
        deleteOrphans(Expense.self, validIDs: validIDs, in: context)
        deleteOrphans(Vendor.self, validIDs: validIDs, in: context)
        deleteOrphans(PhotoAttachment.self, validIDs: validIDs, in: context)
        deleteOrphans(ChangeOrder.self, validIDs: validIDs, in: context)
        deleteOrphans(ProjectDocument.self, validIDs: validIDs, in: context)

        for project in projects {
            repairLegacyBudgetNames(for: project, in: context)
        }

        recalculateProjects(in: context)
        try? context.save()
    }

    private static func isLegacyCustomHomeProject(_ project: Project) -> Bool {
        let address = project.address.localizedLowercase
        let name = project.name.localizedLowercase
        return address.contains("676 rutgers") || name.contains("676 rutgers")
    }

    @MainActor
    private static func recalculateProjects(in context: ModelContext) {
        let projects = (try? context.fetch(FetchDescriptor<Project>())) ?? []
        let items = (try? context.fetch(FetchDescriptor<BudgetLineItem>())) ?? []
        let expenses = (try? context.fetch(FetchDescriptor<Expense>())) ?? []
        let changeOrders = (try? context.fetch(FetchDescriptor<ChangeOrder>())) ?? []

        for project in projects {
            BudgetMathService.recalculateActuals(for: project.id, items: items, expenses: expenses, changeOrders: changeOrders)
        }
    }

    @MainActor
    private static func deleteOrphans<T: PersistentModel & ProjectScoped>(_ type: T.Type, validIDs: Set<UUID>, in context: ModelContext) {
        let descriptor = FetchDescriptor<T>()
        let records = (try? context.fetch(descriptor)) ?? []
        for record in records where !validIDs.contains(record.projectID) {
            context.delete(record)
        }
    }

    @MainActor
    private static func repairLegacyBudgetNames(for project: Project, in context: ModelContext) {
        let renameMap = [
            "Pre Construction": "Soft Costs",
            "Site Work": "Demo & Site Prep",
            "Framing": "Framing & Structural",
            "Exterior": "Exterior Envelope",
            "Windows": "Windows & Exterior Doors",
            "Low Voltage": "Low Voltage & Security",
            "Trim": "Interior Doors & Trim",
            "Tile": "Tile & Stone",
            "Kitchen": "Kitchen & Cabinetry",
            "Bathrooms": "Bathrooms & Fixtures",
            "Landscaping": "Landscaping & Hardscape",
            "Driveway": "Driveway & Walkways"
        ]

        let projectID = project.id
        let categories = (try? context.fetch(FetchDescriptor<BudgetCategory>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let items = (try? context.fetch(FetchDescriptor<BudgetLineItem>(predicate: #Predicate { $0.projectID == projectID }))) ?? []

        for category in categories {
            if let updatedName = renameMap[category.name] {
                category.name = updatedName
            }
        }

        for item in items {
            if let updatedName = renameMap[item.categoryName] {
                item.categoryName = updatedName
            }
        }
    }

    @MainActor
    private static func ensureBudgetTemplateCoverage(for project: Project, in context: ModelContext) {
        let projectID = project.id
        var categories = (try? context.fetch(FetchDescriptor<BudgetCategory>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let items = (try? context.fetch(FetchDescriptor<BudgetLineItem>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        var existingItemKeys = Set(items.map { "\($0.categoryName)|\($0.title)".localizedLowercase })

        for (index, seed) in categorySeeds.enumerated() {
            if categories.contains(where: { $0.name.caseInsensitiveCompare(seed.name) == .orderedSame }) == false {
                let category = BudgetCategory(
                    projectID: project.id,
                    name: seed.name,
                    sortOrder: index,
                    targetBudget: seed.totalBudget,
                    systemImage: seed.systemImage
                )
                context.insert(category)
                categories.append(category)
            }

            for itemSeed in seed.items {
                let key = "\(seed.name)|\(itemSeed.title)".localizedLowercase
                guard existingItemKeys.contains(key) == false else { continue }
                let item = BudgetLineItem(
                    projectID: project.id,
                    costCode: itemSeed.costCode,
                    title: itemSeed.title,
                    categoryName: seed.name,
                    budget: itemSeed.budget,
                    notes: itemSeed.notes
                )
                context.insert(item)
                existingItemKeys.insert(key)
            }
        }
    }

    #if DEBUG
        private static var shouldSeedWorkflowSamples: Bool {
            ProcessInfo.processInfo.arguments.contains("--seed-workflow-samples")
                || ProcessInfo.processInfo.environment["SEED_WORKFLOW_SAMPLES"] == "1"
        }

        @MainActor
        private static func ensureWorkflowSampleProjects(existingProjects: [Project], in context: ModelContext) {
            var existingNames = Set(existingProjects.map(\.name.localizedLowercase))

            for sample in workflowSamples where !existingNames.contains(sample.name.localizedLowercase) {
                let template = ProjectTemplateService.template(for: sample.templateType)
                let project = Project(
                    name: sample.name,
                    address: sample.address,
                    status: .active,
                    priority: sample.templateType == .customHome ? .high : .normal,
                    purchasePrice: sample.purchasePrice,
                    lotDimensions: sample.lotDimensions,
                    proposedBuildDimensions: sample.scope,
                    footprint: sample.scope,
                    stories: sample.stories,
                    basement: sample.basement,
                    scopeSummary: sample.scope,
                    startDate: daysAgo(20),
                    targetFinishDate: daysFromNow(120),
                    constructionBudget: sample.budget,
                    contingencyBudget: sample.contingency
                )
                context.insert(project)

                let draft = ProjectTemplateService.makeDraft(from: template, constructionBudget: sample.budget)
                let items = insertBudgetDraft(draft, for: project, in: context)
                insertContingency(sample.contingency, for: project, sortOrder: draft.count, in: context)
                insertWorkflowTransactions(for: project, items: items, template: template, in: context)

                existingNames.insert(sample.name.localizedLowercase)
            }

            recalculateProjects(in: context)
            try? context.save()
        }

        @discardableResult
        @MainActor
        private static func insertBudgetDraft(
            _ draft: [BudgetCategoryDraft],
            for project: Project,
            in context: ModelContext
        ) -> [BudgetLineItem] {
            var insertedItems: [BudgetLineItem] = []

            for (categoryIndex, category) in draft.enumerated() {
                let categoryName = category.name.trimmed.isEmpty ? "Category \(categoryIndex + 1)" : category.name.trimmed
                context.insert(
                    BudgetCategory(
                        projectID: project.id,
                        name: categoryName,
                        sortOrder: categoryIndex,
                        targetBudget: category.amount,
                        systemImage: category.systemImage
                    )
                )

                for item in category.items where item.amount > 0 || !item.title.trimmed.isEmpty {
                    let budgetItem = BudgetLineItem(
                        projectID: project.id,
                        costCode: item.costCode.trimmed,
                        title: item.title.trimmed.isEmpty ? "Budget Item" : item.title.trimmed,
                        categoryName: categoryName,
                        budget: item.amount,
                        notes: item.notes.trimmed,
                        isPinned: item.isLocked
                    )
                    context.insert(budgetItem)
                    insertedItems.append(budgetItem)
                }
            }

            return insertedItems
        }

        @MainActor
        private static func insertContingency(_ amount: Double, for project: Project, sortOrder: Int, in context: ModelContext) {
            guard amount > 0 else { return }

            context.insert(
                BudgetCategory(
                    projectID: project.id,
                    name: "Contingency",
                    sortOrder: sortOrder,
                    targetBudget: amount,
                    systemImage: "shield.lefthalf.filled"
                )
            )

            context.insert(
                BudgetLineItem(
                    projectID: project.id,
                    costCode: "9001",
                    title: "Contingency Reserve",
                    categoryName: "Contingency",
                    budget: amount,
                    isPinned: true
                )
            )
        }

        @MainActor
        private static func insertWorkflowTransactions(
            for project: Project,
            items: [BudgetLineItem],
            template: ProjectTemplate,
            in context: ModelContext
        ) {
            let sortedItems = items
                .filter { $0.categoryName != "Contingency" && $0.budget > 0 }
                .sorted { $0.costCode.localizedStandardCompare($1.costCode) == .orderedAscending }

            guard sortedItems.count >= 3 else { return }

            let vendors = [
                Vendor(projectID: project.id, name: "\(template.title) Prime", trade: "General Contractor"),
                Vendor(projectID: project.id, name: "\(template.title) Supply", trade: "Materials"),
                Vendor(projectID: project.id, name: "\(template.title) Finish Crew", trade: "Labor")
            ]
            vendors.forEach { context.insert($0) }

            let paidItem = sortedItems[0]
            let unpaidItem = sortedItems[1]
            let partialItem = sortedItems[2]

            let paidExpense = Expense(
                projectID: project.id,
                amount: max(500, paidItem.budget * 0.18),
                vendorName: vendors[0].name,
                invoiceNumber: "TST-\(paidItem.costCode)-001",
                date: .now.addingTimeInterval(-12 * 86400),
                paidDate: .now.addingTimeInterval(-9 * 86400),
                paymentMethod: "Check",
                paymentReference: "CHK-\(paidItem.costCode)",
                categoryName: paidItem.categoryName,
                budgetLineItemID: paidItem.id,
                budgetLineItemTitle: paidItem.title,
                notes: "Paid test invoice tied to \(paidItem.title).",
                isPaid: true
            )

            let unpaidAmount = max(450, unpaidItem.budget * 0.12)
            let unpaidExpense = Expense(
                projectID: project.id,
                amount: unpaidAmount,
                amountPaid: 0,
                vendorName: vendors[1].name,
                invoiceNumber: "TST-\(unpaidItem.costCode)-002",
                date: .now.addingTimeInterval(-5 * 86400),
                dueDate: .now.addingTimeInterval(7 * 86400),
                categoryName: unpaidItem.categoryName,
                budgetLineItemID: unpaidItem.id,
                budgetLineItemTitle: unpaidItem.title,
                notes: "Open test invoice tied to \(unpaidItem.title).",
                isPaid: false
            )

            let partialAmount = max(650, partialItem.budget * 0.16)
            let partialExpense = Expense(
                projectID: project.id,
                amount: partialAmount,
                amountPaid: partialAmount * 0.5,
                vendorName: vendors[2].name,
                invoiceNumber: "TST-\(partialItem.costCode)-003",
                date: .now.addingTimeInterval(-2 * 86400),
                dueDate: .now.addingTimeInterval(14 * 86400),
                paidDate: .now.addingTimeInterval(-1 * 86400),
                paymentMethod: "ACH",
                paymentReference: "ACH-\(partialItem.costCode)",
                categoryName: partialItem.categoryName,
                budgetLineItemID: partialItem.id,
                budgetLineItemTitle: partialItem.title,
                notes: "Partially paid test invoice tied to \(partialItem.title).",
                isPaid: false
            )

            [paidExpense, unpaidExpense, partialExpense].forEach { context.insert($0) }

            let approvedItem = sortedItems[min(3, sortedItems.count - 1)]
            let pendingItem = sortedItems[min(4, sortedItems.count - 1)]
            let paidChangeItem = sortedItems[min(5, sortedItems.count - 1)]

            let changeOrders = [
                ChangeOrder(
                    projectID: project.id,
                    title: "Owner upgrade allowance",
                    amount: max(750, approvedItem.budget * 0.08),
                    status: .approved,
                    notes: "Approved test change order.",
                    categoryName: approvedItem.categoryName,
                    budgetLineItemID: approvedItem.id,
                    budgetLineItemTitle: approvedItem.title
                ),
                ChangeOrder(
                    projectID: project.id,
                    title: "Pending field condition",
                    amount: max(500, pendingItem.budget * 0.05),
                    status: .pending,
                    notes: "Pending test exposure.",
                    categoryName: pendingItem.categoryName,
                    budgetLineItemID: pendingItem.id,
                    budgetLineItemTitle: pendingItem.title
                ),
                ChangeOrder(
                    projectID: project.id,
                    title: "Paid small scope change",
                    amount: max(300, paidChangeItem.budget * 0.03),
                    status: .paid,
                    notes: "Paid test change order.",
                    categoryName: paidChangeItem.categoryName,
                    budgetLineItemID: paidChangeItem.id,
                    budgetLineItemTitle: paidChangeItem.title
                )
            ]

            changeOrders.forEach { context.insert($0) }
        }
    #endif
}

protocol ProjectScoped: AnyObject {
    var projectID: UUID { get set }
}

extension BudgetCategory: ProjectScoped {}
extension BudgetLineItem: ProjectScoped {}
extension Expense: ProjectScoped {}
extension Vendor: ProjectScoped {}
extension PhotoAttachment: ProjectScoped {}
extension ChangeOrder: ProjectScoped {}
extension ProjectDocument: ProjectScoped {}
extension AllowanceSelection: ProjectScoped {}
extension ProjectTask: ProjectScoped {}
extension BidPackage: ProjectScoped {}
extension Bid: ProjectScoped {}

private struct CategorySeed {
    let name: String
    let systemImage: String
    let items: [LineItemSeed]

    var totalBudget: Double {
        items.reduce(0) { $0 + $1.budget }
    }
}

private struct LineItemSeed {
    let costCode: String
    let title: String
    let budget: Double
    var actual: Double = 0
    var committed: Double = 0
    var notes: String = ""
    var isPinned: Bool = false
}

#if DEBUG
    private struct WorkflowSample {
        let templateType: ProjectTemplateType
        let name: String
        let address: String
        let budget: Double
        let contingency: Double
        var purchasePrice: Double = 0
        var lotDimensions: String = ""
        var scope: String
        var stories: Int = 1
        var basement: String = ""
    }

    private let workflowSamples: [WorkflowSample] = [
        WorkflowSample(
            templateType: .customHome,
            name: "Test - New Custom Home",
            address: "10 Alpine Ridge, Paramus NJ",
            budget: 1_450_000,
            contingency: 145_000,
            purchasePrice: 975_000,
            lotDimensions: "80 x 130",
            scope: "72 x 50 home",
            stories: 2,
            basement: "Unfinished basement"
        ),
        WorkflowSample(
            templateType: .majorRenovation,
            name: "Test - Major Renovation",
            address: "22 Ridgewood Ave, Ridgewood NJ",
            budget: 650_000,
            contingency: 65000,
            purchasePrice: 1_150_000,
            scope: "3,800 sf whole-home renovation"
        ),
        WorkflowSample(
            templateType: .addition,
            name: "Test - Addition",
            address: "45 Cambridge Rd, Glen Rock NJ",
            budget: 420_000,
            contingency: 42000,
            lotDimensions: "Side yard setback tight",
            scope: "24 x 32 two-story addition",
            stories: 2,
            basement: "Crawlspace and tie-in"
        ),
        WorkflowSample(
            templateType: .poolBackyard,
            name: "Test - Pool Backyard",
            address: "18 Fairway Ct, Franklin Lakes NJ",
            budget: 285_000,
            contingency: 28500,
            lotDimensions: "Rear yard 90 x 70",
            scope: "18 x 36 gunite pool with patio"
        ),
        WorkflowSample(
            templateType: .deckPatio,
            name: "Test - Deck Patio",
            address: "7 Stone Bridge Ln, Wyckoff NJ",
            budget: 95000,
            contingency: 9500,
            lotDimensions: "Rear work area 45 x 32",
            scope: "650 sf composite deck and rail"
        ),
        WorkflowSample(
            templateType: .kitchenRemodel,
            name: "Test - Kitchen Remodel",
            address: "31 Elm St, Ho-Ho-Kus NJ",
            budget: 155_000,
            contingency: 15500,
            scope: "18 x 22 kitchen with layout change"
        ),
        WorkflowSample(
            templateType: .bathroomRemodel,
            name: "Test - Bathroom Remodel",
            address: "84 Spring Ave, Westwood NJ",
            budget: 72000,
            contingency: 7200,
            scope: "Primary bath with steam shower"
        ),
        WorkflowSample(
            templateType: .basementFinish,
            name: "Test - Basement Finish",
            address: "109 Lincoln Ave, Paramus NJ",
            budget: 190_000,
            contingency: 19000,
            scope: "1,450 sf finished basement",
            basement: "Open unfinished basement"
        ),
        WorkflowSample(
            templateType: .garageBuild,
            name: "Test - Garage Build",
            address: "55 Orchard Ln, Saddle River NJ",
            budget: 175_000,
            contingency: 17500,
            lotDimensions: "Detached garage near rear drive",
            scope: "24 x 36 three-car garage",
            stories: 1
        ),
        WorkflowSample(
            templateType: .landscapingHardscape,
            name: "Test - Landscaping Hardscape",
            address: "6 Brookside Dr, Woodcliff Lake NJ",
            budget: 135_000,
            contingency: 13500,
            lotDimensions: "Front and rear yard",
            scope: "Paver driveway, walls, drainage, planting"
        ),
        WorkflowSample(
            templateType: .custom,
            name: "Test - Custom Tracker",
            address: "1 Builder Way, Paramus NJ",
            budget: 50000,
            contingency: 5000,
            scope: "Custom punch-list allowance"
        )
    ]
#endif

private let categorySeeds: [CategorySeed] = [
    CategorySeed(
        name: "Soft Costs",
        systemImage: "doc.text.magnifyingglass",
        items: [
            LineItemSeed(
                costCode: "0101",
                title: "Architecture and Design",
                budget: 16000,
                actual: 14000,
                notes: "Final construction set issued."
            ),
            LineItemSeed(costCode: "0102", title: "Structural Engineering", budget: 6000),
            LineItemSeed(costCode: "0103", title: "Survey, Topo and Stakeout", budget: 7000, actual: 6500),
            LineItemSeed(
                costCode: "0104",
                title: "Permits and Municipal Fees",
                budget: 8000,
                actual: 9000,
                committed: 4000,
                isPinned: true
            ),
            LineItemSeed(costCode: "0105", title: "Utility Applications and Inspections", budget: 3000)
        ]
    ),
    CategorySeed(
        name: "Demo & Site Prep",
        systemImage: "hammer",
        items: [
            LineItemSeed(costCode: "0201", title: "Demo Permit and Abatement", budget: 4000),
            LineItemSeed(costCode: "0202", title: "Demolition and Haul-Off", budget: 12000),
            LineItemSeed(costCode: "0203", title: "Clearing and Rough Grading", budget: 6000, actual: 8500),
            LineItemSeed(costCode: "0204", title: "Soil Protection and Stabilized Entrance", budget: 6000)
        ]
    ),
    CategorySeed(
        name: "General Conditions",
        systemImage: "checklist",
        items: [
            LineItemSeed(costCode: "0301", title: "Project Management and Supervision", budget: 14000),
            LineItemSeed(costCode: "0302", title: "Temporary Toilet, Dumpster and Field Supplies", budget: 6000),
            LineItemSeed(costCode: "0303", title: "Temporary Utilities", budget: 6000, actual: 2200),
            LineItemSeed(costCode: "0304", title: "Site Protection and Safety", budget: 4000),
            LineItemSeed(costCode: "0305", title: "Builder's Risk and Project Insurance", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Site Utilities",
        systemImage: "pipe.and.drop",
        items: [
            LineItemSeed(costCode: "0401", title: "Water and Sewer Connections", budget: 8000),
            LineItemSeed(costCode: "0402", title: "Storm Drainage and Dry Wells", budget: 7000),
            LineItemSeed(costCode: "0403", title: "Gas and Electrical Service", budget: 6000),
            LineItemSeed(costCode: "0404", title: "Utility Trenching and Backfill", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Foundation",
        systemImage: "square.stack.3d.down.right",
        items: [
            LineItemSeed(costCode: "0501", title: "Excavation and Export", budget: 20000, committed: 12000, isPinned: true),
            LineItemSeed(costCode: "0502", title: "Footings", budget: 18000, committed: 20000),
            LineItemSeed(costCode: "0503", title: "Foundation Walls", budget: 36000),
            LineItemSeed(costCode: "0504", title: "Basement Slab and Egress", budget: 14000),
            LineItemSeed(costCode: "0505", title: "Waterproofing and Footing Drains", budget: 12000)
        ]
    ),
    CategorySeed(
        name: "Concrete & Masonry",
        systemImage: "cube.transparent",
        items: [
            LineItemSeed(costCode: "0601", title: "Stoops and Areaways", budget: 6000),
            LineItemSeed(costCode: "0602", title: "Retaining Walls", budget: 8000),
            LineItemSeed(costCode: "0603", title: "Garage Slab", budget: 5000),
            LineItemSeed(costCode: "0604", title: "Miscellaneous Masonry", budget: 3000)
        ]
    ),
    CategorySeed(
        name: "Framing & Structural",
        systemImage: "house.lodge",
        items: [
            LineItemSeed(costCode: "0701", title: "Lumber Package", budget: 68000, committed: 62000, isPinned: true),
            LineItemSeed(costCode: "0702", title: "Framing Labor", budget: 45000, committed: 36000),
            LineItemSeed(costCode: "0703", title: "Engineered Beams and LVLs", budget: 12000),
            LineItemSeed(costCode: "0704", title: "Sheathing, Hardware and Connectors", budget: 10000)
        ]
    ),
    CategorySeed(
        name: "Garage",
        systemImage: "car",
        items: [
            LineItemSeed(costCode: "0801", title: "Garage Framing and Headers", budget: 7000),
            LineItemSeed(costCode: "0802", title: "Garage Doors and Openers", budget: 9000),
            LineItemSeed(costCode: "0803", title: "Garage Floor Finish", budget: 3000),
            LineItemSeed(costCode: "0804", title: "Garage Electrical and Storage Prep", budget: 5000)
        ]
    ),
    CategorySeed(
        name: "Exterior Envelope",
        systemImage: "rectangle.portrait.and.arrow.right",
        items: [
            LineItemSeed(costCode: "0901", title: "Stone and Stucco", budget: 30000),
            LineItemSeed(costCode: "0902", title: "Siding, Cornice and Accent Panels", budget: 12000),
            LineItemSeed(costCode: "0903", title: "Gutters, Leaders and Metal Details", budget: 5000),
            LineItemSeed(costCode: "0904", title: "WRB, Flashing and Exterior Waterproofing", budget: 8000)
        ]
    ),
    CategorySeed(
        name: "Roofing",
        systemImage: "triangle",
        items: [
            LineItemSeed(costCode: "1001", title: "Roof Material and Labor", budget: 24000),
            LineItemSeed(costCode: "1002", title: "Flashing, Metal and Skylight Prep", budget: 6000),
            LineItemSeed(costCode: "1003", title: "Roof Ventilation", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Windows & Exterior Doors",
        systemImage: "square.grid.2x2",
        items: [
            LineItemSeed(costCode: "1101", title: "Window Package", budget: 48000, committed: 40000, isPinned: true),
            LineItemSeed(costCode: "1102", title: "Window Install and Flashing", budget: 8000),
            LineItemSeed(costCode: "1103", title: "Exterior Entry and Patio Doors", budget: 8000),
            LineItemSeed(costCode: "1104", title: "Exterior Door Hardware", budget: 2000)
        ]
    ),
    CategorySeed(
        name: "Plumbing",
        systemImage: "drop",
        items: [
            LineItemSeed(costCode: "1201", title: "Plumbing Rough-In", budget: 32000),
            LineItemSeed(costCode: "1202", title: "Water and Gas Service", budget: 8000),
            LineItemSeed(costCode: "1203", title: "Plumbing Trim Labor", budget: 6000),
            LineItemSeed(costCode: "1204", title: "Plumbing Fixture Allowance", budget: 18000)
        ]
    ),
    CategorySeed(
        name: "HVAC",
        systemImage: "fan",
        items: [
            LineItemSeed(costCode: "1301", title: "HVAC Equipment", budget: 28000),
            LineItemSeed(costCode: "1302", title: "Ductwork and Distribution", budget: 22000),
            LineItemSeed(costCode: "1303", title: "Controls and Start-Up", budget: 6000),
            LineItemSeed(costCode: "1304", title: "Bath and Kitchen Ventilation", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Electrical",
        systemImage: "bolt",
        items: [
            LineItemSeed(costCode: "1401", title: "Electrical Rough-In", budget: 32000),
            LineItemSeed(costCode: "1402", title: "Service, Panels and Generator Prep", budget: 16000),
            LineItemSeed(costCode: "1403", title: "Trim Devices and Switchgear", budget: 10000),
            LineItemSeed(costCode: "1404", title: "Lighting Fixture Allowance", budget: 12000)
        ]
    ),
    CategorySeed(
        name: "Low Voltage & Security",
        systemImage: "network",
        items: [
            LineItemSeed(costCode: "1501", title: "Structured Wiring", budget: 7000),
            LineItemSeed(costCode: "1502", title: "Security and Cameras", budget: 5000),
            LineItemSeed(costCode: "1503", title: "AV and Speaker Prewire", budget: 5000),
            LineItemSeed(costCode: "1504", title: "Network Rack and Equipment", budget: 3000)
        ]
    ),
    CategorySeed(
        name: "Insulation",
        systemImage: "thermometer.medium",
        items: [
            LineItemSeed(costCode: "1601", title: "Spray Foam", budget: 14000),
            LineItemSeed(costCode: "1602", title: "Batt and Sound Insulation", budget: 6000),
            LineItemSeed(costCode: "1603", title: "Air Sealing", budget: 2000)
        ]
    ),
    CategorySeed(
        name: "Drywall",
        systemImage: "rectangle.split.3x1",
        items: [
            LineItemSeed(costCode: "1701", title: "Hang and Tape", budget: 32000),
            LineItemSeed(costCode: "1702", title: "Level 5 and Specialty Prep", budget: 8000),
            LineItemSeed(costCode: "1703", title: "Drywall Repairs and Touch-Ups", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Interior Doors & Trim",
        systemImage: "ruler",
        items: [
            LineItemSeed(costCode: "1801", title: "Interior Doors and Hardware", budget: 14000),
            LineItemSeed(costCode: "1802", title: "Casing, Base and Crown", budget: 18000),
            LineItemSeed(costCode: "1803", title: "Built-Ins and Feature Millwork", budget: 16000),
            LineItemSeed(costCode: "1804", title: "Mirrors, Glass and Closet Trim", budget: 8000)
        ]
    ),
    CategorySeed(
        name: "Flooring",
        systemImage: "square.grid.3x3",
        items: [
            LineItemSeed(costCode: "1901", title: "Hardwood Material", budget: 32000),
            LineItemSeed(costCode: "1902", title: "Install, Sand and Finish", budget: 14000),
            LineItemSeed(costCode: "1903", title: "Stair Treads", budget: 8000)
        ]
    ),
    CategorySeed(
        name: "Tile & Stone",
        systemImage: "squareshape.split.2x2",
        items: [
            LineItemSeed(costCode: "2001", title: "Primary Suite Tile", budget: 18000),
            LineItemSeed(costCode: "2002", title: "Secondary Bath Tile", budget: 14000),
            LineItemSeed(costCode: "2003", title: "Mudroom and Laundry Tile", budget: 6000),
            LineItemSeed(costCode: "2004", title: "Waterproofing Systems", budget: 10000)
        ]
    ),
    CategorySeed(
        name: "Painting",
        systemImage: "paintbrush",
        items: [
            LineItemSeed(costCode: "2101", title: "Interior Paint", budget: 28000),
            LineItemSeed(costCode: "2102", title: "Exterior Touch-Up and Stain", budget: 4000),
            LineItemSeed(costCode: "2103", title: "Stain and Specialty Finishes", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Kitchen & Cabinetry",
        systemImage: "cabinet",
        items: [
            LineItemSeed(costCode: "2201", title: "Custom Cabinetry", budget: 42000),
            LineItemSeed(costCode: "2202", title: "Countertops", budget: 20000),
            LineItemSeed(costCode: "2203", title: "Backsplash", budget: 8000),
            LineItemSeed(costCode: "2204", title: "Appliance Panels and Trim Kits", budget: 2000)
        ]
    ),
    CategorySeed(
        name: "Bathrooms & Fixtures",
        systemImage: "shower",
        items: [
            LineItemSeed(costCode: "2301", title: "Vanities and Linen Cabinets", budget: 16000),
            LineItemSeed(costCode: "2302", title: "Shower Glass and Mirrors", budget: 8000),
            LineItemSeed(costCode: "2303", title: "Bath Fixture Allowance", budget: 22000),
            LineItemSeed(costCode: "2304", title: "Bath Accessories", budget: 6000)
        ]
    ),
    CategorySeed(
        name: "Appliances",
        systemImage: "refrigerator",
        items: [
            LineItemSeed(costCode: "2401", title: "Appliance Package", budget: 20000),
            LineItemSeed(costCode: "2402", title: "Delivery and Installation", budget: 2000)
        ]
    ),
    CategorySeed(
        name: "Fireplace & Specialty",
        systemImage: "flame",
        items: [
            LineItemSeed(costCode: "2501", title: "Fireplace Unit and Venting", budget: 7000),
            LineItemSeed(costCode: "2502", title: "Mantel and Surround", budget: 5000)
        ]
    ),
    CategorySeed(
        name: "Stairs & Railings",
        systemImage: "stairs",
        items: [
            LineItemSeed(costCode: "2601", title: "Stairs and Landings", budget: 8000),
            LineItemSeed(costCode: "2602", title: "Interior Railings", budget: 10000),
            LineItemSeed(costCode: "2603", title: "Exterior Railings", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Closets & Organization",
        systemImage: "hanger",
        items: [
            LineItemSeed(costCode: "2701", title: "Closet Systems", budget: 9000),
            LineItemSeed(costCode: "2702", title: "Shelving and Accessories", budget: 3000)
        ]
    ),
    CategorySeed(
        name: "Final Cleanup & Closeout",
        systemImage: "checkmark.seal",
        items: [
            LineItemSeed(costCode: "2801", title: "Final Clean", budget: 4000),
            LineItemSeed(costCode: "2802", title: "Inspections and Certificate of Occupancy", budget: 4000),
            LineItemSeed(costCode: "2803", title: "Punch List Allowance", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Landscaping & Hardscape",
        systemImage: "leaf",
        items: [
            LineItemSeed(costCode: "2901", title: "Final Grading and Topsoil", budget: 10000),
            LineItemSeed(costCode: "2902", title: "Plantings and Sod", budget: 17000),
            LineItemSeed(costCode: "2903", title: "Irrigation", budget: 9000),
            LineItemSeed(costCode: "2904", title: "Landscape Lighting", budget: 5000)
        ]
    ),
    CategorySeed(
        name: "Driveway & Walkways",
        systemImage: "road.lanes",
        items: [
            LineItemSeed(costCode: "3001", title: "Driveway Pavers or Asphalt", budget: 14000),
            LineItemSeed(costCode: "3002", title: "Apron and Walkways", budget: 4000)
        ]
    ),
    CategorySeed(
        name: "Contingency",
        systemImage: "shield.lefthalf.filled",
        items: [
            LineItemSeed(costCode: "9001", title: "Owner Contingency Reserve", budget: 200_000)
        ]
    )
]

private func vendors(for projectID: UUID) -> [Vendor] {
    [
        Vendor(
            projectID: projectID,
            name: "Bergen Design Studio",
            trade: "Architecture",
            phone: "(201) 555-0130",
            email: "studio@example.com"
        ),
        Vendor(projectID: projectID, name: "Garden State Survey", trade: "Survey"),
        Vendor(projectID: projectID, name: "Paramus Permit Office", trade: "Municipal"),
        Vendor(projectID: projectID, name: "North Jersey Siteworks", trade: "Site Work"),
        Vendor(projectID: projectID, name: "Palisades Foundation Co.", trade: "Foundation"),
        Vendor(projectID: projectID, name: "Summit Frame and Lumber", trade: "Framing"),
        Vendor(projectID: projectID, name: "Alpine Window Supply", trade: "Windows")
    ]
}

private func sampleExpenses(projectID: UUID, using items: [String: BudgetLineItem]) -> [Expense] {
    [
        Expense(
            projectID: projectID,
            amount: 14000,
            vendorName: "Bergen Design Studio",
            date: daysAgo(28),
            categoryName: "Soft Costs",
            budgetLineItemID: items["0101"]?.id,
            budgetLineItemTitle: items["0101"]?.title ?? "",
            notes: "Final construction drawings.",
            isPaid: true
        ),
        Expense(
            projectID: projectID,
            amount: 6500,
            vendorName: "Garden State Survey",
            date: daysAgo(24),
            categoryName: "Soft Costs",
            budgetLineItemID: items["0103"]?.id,
            budgetLineItemTitle: items["0103"]?.title ?? "",
            notes: "Boundary, topo and stakeout.",
            isPaid: true
        ),
        Expense(
            projectID: projectID,
            amount: 9000,
            vendorName: "Paramus Permit Office",
            date: daysAgo(20),
            categoryName: "Soft Costs",
            budgetLineItemID: items["0104"]?.id,
            budgetLineItemTitle: items["0104"]?.title ?? "",
            isPaid: true
        ),
        Expense(
            projectID: projectID,
            amount: 8500,
            vendorName: "North Jersey Siteworks",
            date: daysAgo(12),
            categoryName: "Demo & Site Prep",
            budgetLineItemID: items["0203"]?.id,
            budgetLineItemTitle: items["0203"]?.title ?? "",
            notes: "Initial clearing and rough grade.",
            isPaid: true
        ),
        Expense(
            projectID: projectID,
            amount: 2200,
            vendorName: "PSE&G",
            date: daysAgo(5),
            categoryName: "General Conditions",
            budgetLineItemID: items["0303"]?.id,
            budgetLineItemTitle: items["0303"]?.title ?? "",
            notes: "Temporary power setup.",
            isPaid: false
        )
    ]
}

private func samplePhotos(projectID: UUID, using items: [String: BudgetLineItem]) -> [PhotoAttachment] {
    [
        PhotoAttachment(
            projectID: projectID,
            imageData: placeholderImageData(title: "Site cleared", tint: .systemGreen),
            createdAt: daysAgo(12),
            roomTag: "Exterior",
            phaseTag: "Demo & Site Prep",
            categoryName: "Demo & Site Prep",
            budgetLineItemID: items["0203"]?.id,
            notes: "Initial clearing complete."
        ),
        PhotoAttachment(
            projectID: projectID,
            imageData: placeholderImageData(title: "Stakeout", tint: .systemBlue),
            createdAt: daysAgo(9),
            roomTag: "Lot",
            phaseTag: "Foundation",
            categoryName: "Foundation",
            budgetLineItemID: items["0501"]?.id,
            notes: "Footprint marked for excavation."
        ),
        PhotoAttachment(
            projectID: projectID,
            imageData: placeholderImageData(title: "Temp power", tint: .systemOrange),
            createdAt: daysAgo(5),
            roomTag: "Front",
            phaseTag: "General Conditions",
            categoryName: "General Conditions",
            budgetLineItemID: items["0303"]?.id,
            notes: "Temporary service installed."
        )
    ]
}

private func sampleChangeOrders(projectID: UUID) -> [ChangeOrder] {
    [
        ChangeOrder(
            projectID: projectID,
            title: "Upgrade foundation waterproofing",
            amount: 8750,
            status: .approved,
            notes: "Add dimple mat and enhanced footing drain scope.",
            categoryName: "Foundation",
            createdAt: daysAgo(4)
        ),
        ChangeOrder(
            projectID: projectID,
            title: "Window grille pattern revision",
            amount: 4200,
            status: .pending,
            notes: "Owner review before window package release.",
            categoryName: "Windows & Exterior Doors",
            createdAt: daysAgo(2)
        )
    ]
}

private func sampleDocuments(projectID: UUID) -> [ProjectDocument] {
    [
        ProjectDocument(
            projectID: projectID,
            fileName: "676 Rutgers Survey Placeholder.txt",
            kind: .survey,
            notes: "Replace with final signed survey.",
            uploadedAt: daysAgo(18),
            fileData: Data("Survey placeholder for 676 Rutgers Pl, Paramus NJ.".utf8)
        ),
        ProjectDocument(
            projectID: projectID,
            fileName: "Architect Plans Placeholder.txt",
            kind: .plans,
            notes: "Final PDF set can be uploaded here.",
            uploadedAt: daysAgo(14),
            fileData: Data("Architectural plan placeholder for 70 x 48 proposed build.".utf8)
        )
    ]
}

private func daysAgo(_ value: Int) -> Date {
    Calendar.current.date(byAdding: .day, value: -value, to: .now) ?? .now
}

private func daysFromNow(_ value: Int) -> Date {
    Calendar.current.date(byAdding: .day, value: value, to: .now) ?? .now
}

private func placeholderImageData(title: String, tint: UIColor) -> Data? {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 2

    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 900, height: 1200), format: format)
    return renderer.pngData { context in
        let rect = CGRect(x: 0, y: 0, width: 900, height: 1200)
        tint.setFill()
        context.fill(rect)

        UIColor.black.withAlphaComponent(0.18).setFill()
        context.fill(CGRect(x: 0, y: 760, width: 900, height: 440))

        let titleAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 72, weight: .bold),
            .foregroundColor: UIColor.white
        ]
        let subtitleAttributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 34, weight: .semibold),
            .foregroundColor: UIColor.white.withAlphaComponent(0.78)
        ]

        title.draw(in: CGRect(x: 56, y: 820, width: 780, height: 180), withAttributes: titleAttributes)
        "676 Rutgers Pl".draw(in: CGRect(x: 56, y: 1008, width: 780, height: 80), withAttributes: subtitleAttributes)
    }
}
