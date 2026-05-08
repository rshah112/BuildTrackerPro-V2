import Foundation
import SwiftData

enum ProjectTemplateType: String, CaseIterable, Identifiable {
    case customHome
    case majorRenovation
    case addition
    case poolBackyard
    case deckPatio
    case kitchenRemodel
    case bathroomRemodel
    case basementFinish
    case garageBuild
    case landscapingHardscape
    case custom

    var id: String {
        rawValue
    }
}

struct ProjectTemplate: Identifiable {
    let type: ProjectTemplateType
    let title: String
    let subtitle: String
    let typicalRange: String
    let systemImage: String
    let categories: [TemplateCategory]
    let photoFolders: [String]
    let documentKinds: [ProjectDocumentKind]

    var id: ProjectTemplateType {
        type
    }

    var itemCount: Int {
        categories.reduce(0) { $0 + $1.items.count }
    }
}

struct TemplateCategory {
    let name: String
    let systemImage: String
    let percent: Double
    let items: [TemplateLineItem]
}

struct TemplateLineItem {
    let title: String
    let share: Double
    var notes: String = ""
}

struct BudgetCategoryDraft: Identifiable {
    let id = UUID()
    var name: String
    var systemImage: String
    var isLocked = false
    var items: [BudgetLineItemDraft]

    var amount: Double {
        items.reduce(0) { $0 + $1.amount }
    }
}

struct BudgetLineItemDraft: Identifiable {
    let id = UUID()
    var costCode: String
    var title: String
    var amount: Double
    var isLocked = false
    var notes = ""
}

enum ProjectTemplateService {
    static var templates: [ProjectTemplate] {
        [
            customHome,
            majorRenovation,
            addition,
            poolBackyard,
            deckPatio,
            kitchenRemodel,
            bathroomRemodel,
            basementFinish,
            garageBuild,
            landscapingHardscape,
            custom
        ]
    }

    static func template(for type: ProjectTemplateType) -> ProjectTemplate {
        templates.first { $0.type == type } ?? customHome
    }

    static func makeDraft(from template: ProjectTemplate, constructionBudget: Double) -> [BudgetCategoryDraft] {
        template.categories.enumerated().map { categoryIndex, category in
            let categoryAmount = max(0, constructionBudget) * category.percent / 100
            let totalShare = category.items.reduce(0) { $0 + $1.share }
            let divisor = totalShare > 0 ? totalShare : 1

            let items = category.items.enumerated().map { itemIndex, item in
                BudgetLineItemDraft(
                    costCode: String(format: "%02d%02d", categoryIndex + 1, itemIndex + 1),
                    title: item.title,
                    amount: (categoryAmount * item.share / divisor).roundedToDollars,
                    notes: item.notes
                )
            }

            return BudgetCategoryDraft(
                name: category.name,
                systemImage: category.systemImage,
                items: items
            )
        }
    }

    @MainActor
    static func insertBudgetDraft(_ draft: [BudgetCategoryDraft], for project: Project, in context: ModelContext) {
        for (categoryIndex, category) in draft.enumerated() {
            context.insert(
                BudgetCategory(
                    projectID: project.id,
                    name: category.name.trimmed.isEmpty ? "Category \(categoryIndex + 1)" : category.name.trimmed,
                    sortOrder: categoryIndex,
                    targetBudget: category.amount,
                    systemImage: category.systemImage
                )
            )

            for item in category.items where item.amount > 0 || !item.title.trimmed.isEmpty {
                context.insert(
                    BudgetLineItem(
                        projectID: project.id,
                        costCode: item.costCode.trimmed,
                        title: item.title.trimmed.isEmpty ? "Budget Item" : item.title.trimmed,
                        categoryName: category.name.trimmed.isEmpty ? "Category \(categoryIndex + 1)" : category.name.trimmed,
                        roomTag: RoomCatalog.inferredRoom(
                            title: item.title.trimmed,
                            category: category.name.trimmed,
                            project: project
                        ),
                        budget: item.amount,
                        notes: item.notes.trimmed,
                        isPinned: item.isLocked
                    )
                )
            }
        }
    }
}

private extension Double {
    var roundedToDollars: Double {
        rounded()
    }
}

private let customHome = ProjectTemplate(
    type: .customHome,
    title: "New Custom Home",
    subtitle: "Ground-up home construction",
    typicalRange: "$700k - $2.5M+",
    systemImage: "house.lodge",
    categories: [
        TemplateCategory(name: "Site Work", systemImage: "hammer", percent: 7.6, items: [
            TemplateLineItem(title: "Permits and Municipal Fees", share: 1.8),
            TemplateLineItem(title: "Architecture and Engineering", share: 1.5),
            TemplateLineItem(title: "Water, Sewer and Utility Fees", share: 1.5),
            TemplateLineItem(title: "Demo, Clearing and Grading", share: 1.8),
            TemplateLineItem(title: "Site Protection and Other", share: 1.0)
        ]),
        TemplateCategory(name: "Foundation", systemImage: "square.stack.3d.down.right", percent: 10.5, items: [
            TemplateLineItem(title: "Excavation and Export", share: 2.2),
            TemplateLineItem(title: "Footings and Foundation Walls", share: 4.8),
            TemplateLineItem(title: "Slab, Waterproofing and Drains", share: 2.8),
            TemplateLineItem(title: "Foundation Other", share: 0.7)
        ]),
        TemplateCategory(name: "Framing", systemImage: "house.lodge", percent: 16.6, items: [
            TemplateLineItem(title: "Lumber and Framing Package", share: 8.8),
            TemplateLineItem(title: "Framing Labor", share: 4.2),
            TemplateLineItem(title: "Trusses, Beams and Steel", share: 2.2),
            TemplateLineItem(title: "Sheathing, Hardware and Connectors", share: 1.4)
        ]),
        TemplateCategory(name: "Exterior", systemImage: "rectangle.portrait.and.arrow.right", percent: 13.4, items: [
            TemplateLineItem(title: "Exterior Wall Finish", share: 5.7),
            TemplateLineItem(title: "Roofing", share: 3.9),
            TemplateLineItem(title: "Windows, Exterior Doors and Garage Door", share: 3.7),
            TemplateLineItem(title: "Exterior Other", share: 0.1)
        ]),
        TemplateCategory(name: "Major Systems", systemImage: "bolt", percent: 19.2, items: [
            TemplateLineItem(title: "Plumbing Rough-In", share: 6.3),
            TemplateLineItem(title: "Electrical Rough-In", share: 6.4),
            TemplateLineItem(title: "HVAC Equipment and Ductwork", share: 6.3),
            TemplateLineItem(title: "Low Voltage and Other Systems", share: 0.2)
        ]),
        TemplateCategory(name: "Interior Finishes", systemImage: "paintbrush", percent: 24.1, items: [
            TemplateLineItem(title: "Insulation", share: 1.6),
            TemplateLineItem(title: "Drywall", share: 3.3),
            TemplateLineItem(title: "Interior Doors, Trim and Millwork", share: 3.0),
            TemplateLineItem(title: "Painting", share: 2.6),
            TemplateLineItem(title: "Lighting Fixtures", share: 1.3),
            TemplateLineItem(title: "Cabinets and Countertops", share: 4.5),
            TemplateLineItem(title: "Appliances", share: 1.8),
            TemplateLineItem(title: "Flooring", share: 3.6),
            TemplateLineItem(title: "Plumbing Fixtures", share: 1.9),
            TemplateLineItem(title: "Fireplace and Specialty", share: 0.5)
        ]),
        TemplateCategory(name: "Final Steps", systemImage: "checkmark.seal", percent: 6.5, items: [
            TemplateLineItem(title: "Landscaping", share: 2.2),
            TemplateLineItem(title: "Deck, Patio and Porches", share: 1.1),
            TemplateLineItem(title: "Driveway and Walkways", share: 2.3),
            TemplateLineItem(title: "Final Clean and Closeout", share: 0.9)
        ]),
        TemplateCategory(name: "Other", systemImage: "folder", percent: 2.1, items: [
            TemplateLineItem(title: "General Conditions", share: 1.1),
            TemplateLineItem(title: "Insurance, Safety and Miscellaneous", share: 1.0)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let poolBackyard = ProjectTemplate(
    type: .poolBackyard,
    title: "Pool / Backyard",
    subtitle: "Pool, patio and outdoor living",
    typicalRange: "$150k - $600k",
    systemImage: "figure.pool.swim",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text.magnifyingglass", percent: 6, items: [
            TemplateLineItem(title: "Design and Layout", share: 2),
            TemplateLineItem(title: "Engineering and Permits", share: 3),
            TemplateLineItem(title: "Survey and Markout", share: 1)
        ]),
        TemplateCategory(name: "Demo & Site Prep", systemImage: "hammer", percent: 8, items: [
            TemplateLineItem(title: "Demo and Clearing", share: 3),
            TemplateLineItem(title: "Access, Protection and Haul-Off", share: 3),
            TemplateLineItem(title: "Rough Grading", share: 2)
        ]),
        TemplateCategory(name: "Excavation", systemImage: "arrow.down.to.line", percent: 10, items: [
            TemplateLineItem(title: "Pool Excavation", share: 7),
            TemplateLineItem(title: "Soil Export and Backfill", share: 3)
        ]),
        TemplateCategory(name: "Pool Shell", systemImage: "oval", percent: 20, items: [
            TemplateLineItem(title: "Steel, Forms and Shell", share: 12),
            TemplateLineItem(title: "Waterproofing and Interior Finish", share: 5),
            TemplateLineItem(title: "Tile and Coping Prep", share: 3)
        ]),
        TemplateCategory(name: "Plumbing & Equipment", systemImage: "drop", percent: 16, items: [
            TemplateLineItem(title: "Pool Plumbing", share: 6),
            TemplateLineItem(title: "Pump, Filter and Heater", share: 6),
            TemplateLineItem(title: "Automation and Startup", share: 4)
        ]),
        TemplateCategory(name: "Electrical & Lighting", systemImage: "bolt", percent: 7, items: [
            TemplateLineItem(title: "Electrical Rough-In", share: 4),
            TemplateLineItem(title: "Pool and Landscape Lighting", share: 3)
        ]),
        TemplateCategory(name: "Hardscape", systemImage: "square.grid.3x3", percent: 15, items: [
            TemplateLineItem(title: "Patio Base and Pavers", share: 9),
            TemplateLineItem(title: "Coping and Masonry", share: 4),
            TemplateLineItem(title: "Drainage", share: 2)
        ]),
        TemplateCategory(name: "Landscaping & Finish", systemImage: "leaf", percent: 12, items: [
            TemplateLineItem(title: "Plantings, Sod and Mulch", share: 5),
            TemplateLineItem(title: "Fencing and Safety", share: 4),
            TemplateLineItem(title: "Furniture, Cleanup and Final", share: 3)
        ]),
        TemplateCategory(name: "Outdoor Living", systemImage: "grill", percent: 6, items: [
            TemplateLineItem(title: "Outdoor Kitchen or Bar", share: 4),
            TemplateLineItem(title: "Pergola, Fire Feature or Extras", share: 2)
        ])
    ],
    photoFolders: [
        "Existing Conditions",
        "Layout / Markouts",
        "Excavation",
        "Steel / Forms",
        "Plumbing",
        "Electrical",
        "Shell",
        "Tile / Coping",
        "Hardscape",
        "Landscaping",
        "Final"
    ],
    documentKinds: [.survey, .approvals, .plans, .other]
)

private let deckPatio = ProjectTemplate(
    type: .deckPatio,
    title: "Deck / Patio",
    subtitle: "Decking, stairs, rails or patio",
    typicalRange: "$25k - $250k",
    systemImage: "rectangle.3.group",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text", percent: 8, items: [
            TemplateLineItem(title: "Design and Permit", share: 5),
            TemplateLineItem(title: "Survey or Plot Plan", share: 3)
        ]),
        TemplateCategory(name: "Demo & Prep", systemImage: "hammer", percent: 10, items: [
            TemplateLineItem(title: "Demo and Disposal", share: 5),
            TemplateLineItem(title: "Layout, Protection and Access", share: 5)
        ]),
        TemplateCategory(name: "Footings", systemImage: "square.stack.3d.down.right", percent: 14, items: [
            TemplateLineItem(title: "Excavation and Footings", share: 9),
            TemplateLineItem(title: "Concrete and Inspection", share: 5)
        ]),
        TemplateCategory(name: "Framing", systemImage: "house.lodge", percent: 22, items: [
            TemplateLineItem(title: "Framing Material", share: 12),
            TemplateLineItem(title: "Framing Labor", share: 10)
        ]),
        TemplateCategory(name: "Decking / Surface", systemImage: "square.grid.3x3", percent: 20, items: [
            TemplateLineItem(title: "Decking or Paver Material", share: 12),
            TemplateLineItem(title: "Installation", share: 8)
        ]),
        TemplateCategory(name: "Rails, Stairs & Finish", systemImage: "stairs", percent: 18, items: [
            TemplateLineItem(title: "Railings", share: 8),
            TemplateLineItem(title: "Stairs", share: 6),
            TemplateLineItem(title: "Trim, Fascia and Finish", share: 4)
        ]),
        TemplateCategory(name: "Lighting & Cleanup", systemImage: "lightbulb", percent: 8, items: [
            TemplateLineItem(title: "Lighting and Electrical", share: 4),
            TemplateLineItem(title: "Final Clean and Punch List", share: 4)
        ])
    ],
    photoFolders: ["Existing Conditions", "Demo", "Footings", "Framing", "Decking", "Rails", "Stairs", "Lighting", "Final"],
    documentKinds: [.survey, .approvals, .plans, .other]
)

private let kitchenRemodel = remodelTemplate(
    type: .kitchenRemodel,
    title: "Kitchen Remodel",
    subtitle: "Cabinets, counters, MEP and finishes",
    typicalRange: "$60k - $300k",
    systemImage: "cabinet",
    categories: [
        ("Design & Permits", "doc.text", 7, ["Design", "Permits", "Selections"]),
        ("Demo", "hammer", 7, ["Demo", "Dumpster and Protection"]),
        ("Rough MEP", "bolt", 18, ["Plumbing", "Electrical", "HVAC Adjustments"]),
        ("Walls & Prep", "rectangle.split.3x1", 10, ["Framing", "Drywall", "Paint Prep"]),
        ("Cabinets & Counters", "cabinet", 32, ["Cabinetry", "Countertops", "Backsplash"]),
        ("Appliances & Fixtures", "refrigerator", 16, ["Appliances", "Sink and Faucet", "Lighting Fixtures"]),
        ("Flooring & Finish", "square.grid.3x3", 10, ["Flooring", "Trim", "Final Clean"])
    ]
)

private let bathroomRemodel = remodelTemplate(
    type: .bathroomRemodel,
    title: "Bathroom Remodel",
    subtitle: "Bath, shower, tile and fixtures",
    typicalRange: "$25k - $150k",
    systemImage: "shower",
    categories: [
        ("Design & Permits", "doc.text", 6, ["Design", "Permits"]),
        ("Demo", "hammer", 8, ["Demo", "Protection and Haul-Off"]),
        ("Rough MEP", "bolt", 20, ["Plumbing", "Electrical", "Ventilation"]),
        ("Waterproofing", "drop", 12, ["Shower Pan", "Waterproofing System"]),
        ("Tile & Stone", "squareshape.split.2x2", 24, ["Tile Material", "Tile Labor", "Stone Thresholds"]),
        ("Vanity & Fixtures", "sink", 20, ["Vanity", "Fixtures", "Glass and Mirrors"]),
        ("Paint & Finish", "paintbrush", 10, ["Paint", "Accessories", "Final Clean"])
    ]
)

private let basementFinish = remodelTemplate(
    type: .basementFinish,
    title: "Basement Finish",
    subtitle: "Finished basement or lower level",
    typicalRange: "$80k - $350k",
    systemImage: "stairs",
    categories: [
        ("Design & Permits", "doc.text", 6, ["Design", "Permits"]),
        ("Framing", "house.lodge", 16, ["Layout", "Framing Labor and Material"]),
        ("MEP Rough-In", "bolt", 24, ["Plumbing", "Electrical", "HVAC"]),
        ("Insulation & Drywall", "rectangle.split.3x1", 18, ["Insulation", "Drywall"]),
        ("Flooring & Trim", "square.grid.3x3", 16, ["Flooring", "Doors and Trim"]),
        ("Bath / Wet Bar", "sink", 12, ["Bath Fixtures", "Wet Bar or Built-Ins"]),
        ("Paint & Closeout", "paintbrush", 8, ["Paint", "Final Clean"])
    ]
)

private let majorRenovation = remodelTemplate(
    type: .majorRenovation,
    title: "Major Renovation",
    subtitle: "Whole-home renovation",
    typicalRange: "$250k - $1.5M+",
    systemImage: "house.and.flag",
    categories: [
        ("Soft Costs", "doc.text.magnifyingglass", 7, ["Design", "Engineering", "Permits"]),
        ("Demo & Protection", "hammer", 10, ["Demo", "Protection", "Dumpster"]),
        ("Structural", "house.lodge", 14, ["Framing", "Steel and Beams", "Structural Repairs"]),
        ("Exterior", "rectangle.portrait.and.arrow.right", 10, ["Windows and Doors", "Roofing", "Siding"]),
        ("MEP Systems", "bolt", 22, ["Plumbing", "Electrical", "HVAC"]),
        ("Interior Finishes", "paintbrush", 28, ["Drywall", "Trim", "Cabinets", "Tile", "Flooring", "Paint"]),
        ("Final & Site", "checkmark.seal", 9, ["Landscaping", "Cleanup", "Punch List"])
    ]
)

private let addition = remodelTemplate(
    type: .addition,
    title: "Addition",
    subtitle: "New space tied into existing home",
    typicalRange: "$150k - $800k",
    systemImage: "plus.square.on.square",
    categories: [
        ("Soft Costs", "doc.text.magnifyingglass", 7, ["Design", "Engineering", "Permits"]),
        ("Site & Foundation", "square.stack.3d.down.right", 18, ["Excavation", "Footings", "Foundation"]),
        ("Framing", "house.lodge", 18, ["Framing Material", "Framing Labor", "Tie-In"]),
        ("Exterior", "rectangle.portrait.and.arrow.right", 14, ["Roofing", "Windows and Doors", "Siding"]),
        ("MEP Rough-In", "bolt", 18, ["Plumbing", "Electrical", "HVAC"]),
        ("Interior Finishes", "paintbrush", 19, ["Insulation", "Drywall", "Trim", "Flooring", "Paint"]),
        ("Final & Site", "checkmark.seal", 6, ["Cleanup", "Landscaping Repair", "Punch List"])
    ]
)

private let garageBuild = remodelTemplate(
    type: .garageBuild,
    title: "Garage Build",
    subtitle: "Detached or attached garage",
    typicalRange: "$75k - $350k",
    systemImage: "car",
    categories: [
        ("Design & Permits", "doc.text", 6, ["Design", "Permits"]),
        ("Site & Foundation", "square.stack.3d.down.right", 22, ["Excavation", "Footings", "Slab"]),
        ("Framing", "house.lodge", 24, ["Framing Material", "Framing Labor"]),
        ("Exterior", "rectangle.portrait.and.arrow.right", 18, ["Roofing", "Siding", "Windows and Doors"]),
        ("Garage Doors", "door.garage.closed", 10, ["Garage Doors", "Openers"]),
        ("Electrical & Finish", "bolt", 14, ["Electrical", "Insulation / Drywall", "Storage Prep"]),
        ("Final Site", "checkmark.seal", 6, ["Driveway Tie-In", "Cleanup"])
    ]
)

private let landscapingHardscape = remodelTemplate(
    type: .landscapingHardscape,
    title: "Landscaping / Hardscape",
    subtitle: "Outdoor grading, planting and masonry",
    typicalRange: "$40k - $400k",
    systemImage: "leaf",
    categories: [
        ("Design & Permits", "doc.text", 5, ["Design", "Permits"]),
        ("Site Prep", "hammer", 12, ["Clearing", "Rough Grading", "Drainage Prep"]),
        ("Drainage & Utilities", "drop", 14, ["Drainage", "Irrigation", "Lighting Rough-In"]),
        ("Hardscape", "square.grid.3x3", 34, ["Pavers", "Walls", "Steps and Masonry"]),
        ("Plantings", "leaf", 18, ["Trees and Shrubs", "Sod and Seed", "Mulch"]),
        ("Lighting & Features", "lightbulb", 10, ["Lighting", "Fire or Water Features"]),
        ("Finish", "checkmark.seal", 7, ["Cleanup", "Punch List"])
    ]
)

private let custom = ProjectTemplate(
    type: .custom,
    title: "Custom",
    subtitle: "Start with a blank budget",
    typicalRange: "Any size",
    systemImage: "slider.horizontal.3",
    categories: [
        TemplateCategory(name: "Budget", systemImage: "list.bullet.rectangle", percent: 100, items: [
            TemplateLineItem(title: "Starter Allowance", share: 1)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private func remodelTemplate(
    type: ProjectTemplateType,
    title: String,
    subtitle: String,
    typicalRange: String,
    systemImage: String,
    // swiftlint:disable:next large_tuple
    categories: [(String, String, Double, [String])]
) -> ProjectTemplate {
    ProjectTemplate(
        type: type,
        title: title,
        subtitle: subtitle,
        typicalRange: typicalRange,
        systemImage: systemImage,
        categories: categories.map { category in
            TemplateCategory(
                name: category.0,
                systemImage: category.1,
                percent: category.2,
                items: category.3.map { TemplateLineItem(title: $0, share: 1) }
            )
        },
        photoFolders: PhotoFormViewModel.photoFolderOptions,
        documentKinds: ProjectDocumentKind.allCases
    )
}
