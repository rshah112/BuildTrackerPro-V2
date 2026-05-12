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

// MARK: - Templates

//
// Notes on the structure below
// ----------------------------
// `percent` on a category is its share of the overall project budget (sums to 100 across
// categories in a template). `share` on a line item is normalized within its category, so two
// items with shares 5 and 3 split the category's pie 5:3 regardless of the category's percent.
//
// Item titles read like budget rows on a contractor's takeoff. Optional items meant to be
// deleted if they don't apply are labeled "(Optional)" or "(If Applicable)" so the user sees
// the line and intentionally drops it rather than discovering the gap later as a change order.
//
// The "(#1 Surprise Cost)" tag on tree removal in landscapingHardscape is intentional — these
// templates exist to remind users of costs that get forgotten and become change orders.

private let customHome = ProjectTemplate(
    type: .customHome,
    title: "New Custom Home",
    subtitle: "Ground-up home construction",
    typicalRange: "$700k - $2.5M+",
    systemImage: "house.lodge",
    categories: [
        TemplateCategory(name: "Site Work", systemImage: "hammer", percent: 7.6, items: [
            TemplateLineItem(title: "Permits and Municipal Fees", share: 1.6),
            TemplateLineItem(title: "Architecture and Engineering", share: 1.4),
            TemplateLineItem(title: "Soil Testing and Geotech Report", share: 0.4),
            TemplateLineItem(title: "Water, Sewer and Utility Fees", share: 1.3),
            TemplateLineItem(title: "Septic or Well (Rural Builds)", share: 0.3),
            TemplateLineItem(title: "Demo, Clearing and Grading", share: 1.6),
            TemplateLineItem(title: "Site Protection, Erosion Control and Other", share: 1.0)
        ]),
        TemplateCategory(name: "Foundation", systemImage: "square.stack.3d.down.right", percent: 10.5, items: [
            TemplateLineItem(title: "Excavation and Export", share: 2.1),
            TemplateLineItem(title: "Footings and Foundation Walls", share: 4.6),
            TemplateLineItem(title: "Slab, Waterproofing and Drains", share: 2.6),
            TemplateLineItem(title: "Foundation Insulation and Rigid Board", share: 0.6),
            TemplateLineItem(title: "Foundation Other", share: 0.6)
        ]),
        TemplateCategory(name: "Framing", systemImage: "house.lodge", percent: 16.6, items: [
            TemplateLineItem(title: "Lumber and Framing Package", share: 8.4),
            TemplateLineItem(title: "Framing Labor", share: 4.0),
            TemplateLineItem(title: "Trusses, Beams and Steel", share: 2.0),
            TemplateLineItem(title: "Engineered Beams (LVL, Ridge, Steel)", share: 0.8),
            TemplateLineItem(title: "Sheathing, Hardware and Connectors", share: 1.4)
        ]),
        TemplateCategory(name: "Exterior", systemImage: "rectangle.portrait.and.arrow.right", percent: 13.4, items: [
            TemplateLineItem(title: "Exterior Wall Finish", share: 5.0),
            TemplateLineItem(title: "Stone Veneer or Accent Finish", share: 0.8),
            TemplateLineItem(title: "Roofing", share: 3.6),
            TemplateLineItem(title: "Gutters and Downspouts", share: 0.4),
            TemplateLineItem(title: "Windows, Exterior Doors and Garage Door", share: 3.5),
            TemplateLineItem(title: "Exterior Trim, Soffit and Fascia", share: 0.1)
        ]),
        TemplateCategory(name: "Major Systems", systemImage: "bolt", percent: 19.2, items: [
            TemplateLineItem(title: "Plumbing Rough-In", share: 5.9),
            TemplateLineItem(title: "Electrical Rough-In", share: 6.0),
            TemplateLineItem(title: "HVAC Equipment and Ductwork", share: 6.0),
            TemplateLineItem(title: "Smart Home and Low-Voltage Wiring", share: 0.6),
            TemplateLineItem(title: "Solar, EV and Generator Pre-Wiring", share: 0.5),
            TemplateLineItem(title: "Radon Mitigation and Other Systems", share: 0.2)
        ]),
        TemplateCategory(name: "Interior Finishes", systemImage: "paintbrush", percent: 24.1, items: [
            TemplateLineItem(title: "Insulation", share: 1.5),
            TemplateLineItem(title: "Drywall", share: 3.1),
            TemplateLineItem(title: "Interior Doors, Trim and Millwork", share: 2.7),
            TemplateLineItem(title: "Painting", share: 2.4),
            TemplateLineItem(title: "Lighting Fixtures", share: 1.2),
            TemplateLineItem(title: "Cabinets and Countertops", share: 4.2),
            TemplateLineItem(title: "Appliances", share: 1.7),
            TemplateLineItem(title: "Flooring", share: 3.3),
            TemplateLineItem(title: "Plumbing Fixtures", share: 1.8),
            TemplateLineItem(title: "Fireplace and Specialty", share: 0.5),
            TemplateLineItem(title: "Window Treatments and Blinds", share: 0.7),
            TemplateLineItem(title: "Closet Systems and Built-Ins", share: 0.6),
            TemplateLineItem(title: "Bath Accessories and Mirrors", share: 0.4)
        ]),
        TemplateCategory(name: "Final Steps", systemImage: "checkmark.seal", percent: 6.5, items: [
            TemplateLineItem(title: "Landscaping", share: 2.0),
            TemplateLineItem(title: "Deck, Patio and Porches", share: 1.0),
            TemplateLineItem(title: "Driveway and Walkways", share: 2.1),
            TemplateLineItem(title: "Termite Pretreatment and Final Inspections", share: 0.3),
            TemplateLineItem(title: "Final Clean and Closeout", share: 0.8),
            TemplateLineItem(title: "Punch List Reserve", share: 0.3)
        ]),
        TemplateCategory(name: "Other", systemImage: "folder", percent: 2.1, items: [
            TemplateLineItem(title: "General Conditions", share: 0.9),
            TemplateLineItem(title: "Builder's Risk and Owner's Insurance", share: 0.5),
            TemplateLineItem(title: "Construction Loan Interest", share: 0.4),
            TemplateLineItem(title: "Safety and Miscellaneous", share: 0.3)
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
            TemplateLineItem(title: "Steel, Forms and Shell", share: 11),
            TemplateLineItem(title: "Waterproofing and Interior Finish", share: 4.5),
            TemplateLineItem(title: "Tile and Coping Prep", share: 2.5),
            TemplateLineItem(title: "Pool Cover (Manual or Automatic)", share: 2)
        ]),
        TemplateCategory(name: "Plumbing & Equipment", systemImage: "drop", percent: 16, items: [
            TemplateLineItem(title: "Pool Plumbing", share: 5.5),
            TemplateLineItem(title: "Pump, Filter and Heater", share: 5.5),
            TemplateLineItem(title: "Automation and Startup", share: 3.5),
            TemplateLineItem(title: "Solar Pool Heating (Optional)", share: 1.5)
        ]),
        TemplateCategory(name: "Electrical & Lighting", systemImage: "bolt", percent: 7, items: [
            TemplateLineItem(title: "Electrical Rough-In", share: 3.5),
            TemplateLineItem(title: "Pool and Landscape Lighting", share: 2.5),
            TemplateLineItem(title: "Outdoor Speakers and AV Rough-In", share: 1)
        ]),
        TemplateCategory(name: "Hardscape", systemImage: "square.grid.3x3", percent: 15, items: [
            TemplateLineItem(title: "Patio Base and Pavers", share: 9),
            TemplateLineItem(title: "Coping and Masonry", share: 4),
            TemplateLineItem(title: "Drainage", share: 2)
        ]),
        TemplateCategory(name: "Landscaping & Finish", systemImage: "leaf", percent: 12, items: [
            TemplateLineItem(title: "Plantings, Sod and Mulch", share: 4.5),
            TemplateLineItem(title: "Pool Safety Fence and Self-Closing Gate", share: 3.5),
            TemplateLineItem(title: "Pool Alarm and Safety Equipment", share: 0.5),
            TemplateLineItem(title: "Furniture, Cleanup and Final", share: 3.5)
        ]),
        TemplateCategory(name: "Outdoor Living", systemImage: "grill", percent: 6, items: [
            TemplateLineItem(title: "Outdoor Kitchen or Bar", share: 2.5),
            TemplateLineItem(title: "Pergola or Shade Structure", share: 1),
            TemplateLineItem(title: "Outdoor TV and Entertainment", share: 0.8),
            TemplateLineItem(title: "Outdoor Heaters and Misters", share: 0.5),
            TemplateLineItem(title: "Fire Feature or Specialty Extras", share: 1.2)
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
            TemplateLineItem(title: "Decking or Paver Material", share: 10),
            TemplateLineItem(title: "Installation", share: 7),
            TemplateLineItem(title: "Built-In Benches or Seating", share: 2),
            TemplateLineItem(title: "Built-In Planters", share: 1)
        ]),
        TemplateCategory(name: "Rails, Stairs & Finish", systemImage: "stairs", percent: 18, items: [
            TemplateLineItem(title: "Railings", share: 7),
            TemplateLineItem(title: "Stairs (Deck)", share: 5),
            TemplateLineItem(title: "Ground-Level Stairs or Landing Pad", share: 1.5),
            TemplateLineItem(title: "Pergola or Shade Structure (Optional)", share: 1.5),
            TemplateLineItem(title: "Trim, Fascia and Finish", share: 3)
        ]),
        TemplateCategory(name: "Lighting & Cleanup", systemImage: "lightbulb", percent: 8, items: [
            TemplateLineItem(title: "Lighting", share: 2.5),
            TemplateLineItem(title: "Outdoor Electrical and GFI Outlets", share: 2),
            TemplateLineItem(title: "Outdoor Ceiling Fan (If Covered)", share: 0.5),
            TemplateLineItem(title: "Final Clean and Punch List", share: 3)
        ])
    ],
    photoFolders: ["Existing Conditions", "Demo", "Footings", "Framing", "Decking", "Rails", "Stairs", "Lighting", "Final"],
    documentKinds: [.survey, .approvals, .plans, .other]
)

private let kitchenRemodel = ProjectTemplate(
    type: .kitchenRemodel,
    title: "Kitchen Remodel",
    subtitle: "Cabinets, counters, MEP and finishes",
    typicalRange: "$60k - $300k",
    systemImage: "cabinet",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text", percent: 7, items: [
            TemplateLineItem(title: "Design and Cabinet Plan", share: 2.5),
            TemplateLineItem(title: "Building Permit", share: 1),
            TemplateLineItem(title: "Electrical and Plumbing Permits", share: 1),
            TemplateLineItem(title: "Selections and Project Coordination", share: 2.5)
        ]),
        TemplateCategory(name: "Demo & Protection", systemImage: "hammer", percent: 8, items: [
            TemplateLineItem(title: "Demo", share: 3),
            TemplateLineItem(title: "Dust Protection and Containment", share: 1),
            TemplateLineItem(title: "Dumpster and Haul-Off", share: 2),
            TemplateLineItem(title: "Temporary Kitchen Setup", share: 2)
        ]),
        TemplateCategory(name: "Rough MEP", systemImage: "bolt", percent: 17, items: [
            TemplateLineItem(title: "Plumbing Rough-In", share: 5),
            TemplateLineItem(title: "Pot Filler and Specialty Plumbing", share: 1),
            TemplateLineItem(title: "Electrical Rough-In", share: 6),
            TemplateLineItem(title: "Range Hood Venting", share: 1),
            TemplateLineItem(title: "HVAC Adjustments", share: 4)
        ]),
        TemplateCategory(name: "Walls & Prep", systemImage: "rectangle.split.3x1", percent: 10, items: [
            TemplateLineItem(title: "Framing and Layout Changes", share: 3),
            TemplateLineItem(title: "Drywall", share: 4),
            TemplateLineItem(title: "Paint Prep and Paint", share: 3)
        ]),
        TemplateCategory(name: "Cabinets & Counters", systemImage: "cabinet", percent: 30, items: [
            TemplateLineItem(title: "Base and Upper Cabinetry", share: 14),
            TemplateLineItem(title: "Pantry (Walk-In or Cabinet)", share: 3),
            TemplateLineItem(title: "Cabinet Hardware and Soft-Close Upgrades", share: 1),
            TemplateLineItem(title: "Countertops (Quartz, Granite or Stone)", share: 8),
            TemplateLineItem(title: "Backsplash (Tile)", share: 4)
        ]),
        TemplateCategory(name: "Appliances & Fixtures", systemImage: "refrigerator", percent: 18, items: [
            TemplateLineItem(title: "Major Appliances (Range, Fridge, Dishwasher)", share: 8),
            TemplateLineItem(title: "Range Hood / Vent", share: 2),
            TemplateLineItem(title: "Wine Fridge or Beverage Center", share: 1.5),
            TemplateLineItem(title: "Sink and Faucet", share: 2),
            TemplateLineItem(title: "Garbage Disposal and Trash Pull-Out", share: 0.5),
            TemplateLineItem(title: "Lighting Fixtures (Pendants, Recessed)", share: 2.5),
            TemplateLineItem(title: "Under-Cabinet Lighting", share: 1.5)
        ]),
        TemplateCategory(name: "Flooring & Finish", systemImage: "square.grid.3x3", percent: 10, items: [
            TemplateLineItem(title: "Flooring", share: 6),
            TemplateLineItem(title: "Trim and Baseboards", share: 1.5),
            TemplateLineItem(title: "Final Clean and Punch List", share: 2.5)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let bathroomRemodel = ProjectTemplate(
    type: .bathroomRemodel,
    title: "Bathroom Remodel",
    subtitle: "Bath, shower, tile and fixtures",
    typicalRange: "$25k - $150k",
    systemImage: "shower",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text", percent: 6, items: [
            TemplateLineItem(title: "Design and Layout", share: 2.5),
            TemplateLineItem(title: "Building Permit", share: 1),
            TemplateLineItem(title: "Electrical and Plumbing Permits", share: 1),
            TemplateLineItem(title: "Skylight or Sun Tunnel (Optional)", share: 1.5)
        ]),
        TemplateCategory(name: "Demo & Protection", systemImage: "hammer", percent: 8, items: [
            TemplateLineItem(title: "Demo", share: 4),
            TemplateLineItem(title: "Protection and Haul-Off", share: 3),
            TemplateLineItem(title: "Pocket Door or Layout Cut-In", share: 1)
        ]),
        TemplateCategory(name: "Rough MEP", systemImage: "bolt", percent: 20, items: [
            TemplateLineItem(title: "Plumbing Rough-In", share: 8),
            TemplateLineItem(title: "Electrical Rough-In", share: 5),
            TemplateLineItem(title: "Ventilation and Exhaust Fan", share: 2),
            TemplateLineItem(title: "Heated Floor System (Optional)", share: 3),
            TemplateLineItem(title: "Steam Unit (Optional)", share: 2)
        ]),
        TemplateCategory(name: "Waterproofing", systemImage: "drop", percent: 12, items: [
            TemplateLineItem(title: "Shower Pan", share: 4),
            TemplateLineItem(title: "Waterproofing Membrane System", share: 4),
            TemplateLineItem(title: "Curbless / Linear Drain Conversion", share: 2),
            TemplateLineItem(title: "Shower Niche and Bench", share: 2)
        ]),
        TemplateCategory(name: "Tile & Stone", systemImage: "squareshape.split.2x2", percent: 22, items: [
            TemplateLineItem(title: "Tile Material", share: 9),
            TemplateLineItem(title: "Tile Labor", share: 10),
            TemplateLineItem(title: "Stone Thresholds and Trim", share: 3)
        ]),
        TemplateCategory(name: "Vanity & Fixtures", systemImage: "sink", percent: 22, items: [
            TemplateLineItem(title: "Vanity", share: 5),
            TemplateLineItem(title: "Sink and Faucet", share: 2.5),
            TemplateLineItem(title: "Shower / Tub Fixtures", share: 4),
            TemplateLineItem(title: "Smart Toilet or Bidet Upgrade", share: 3),
            TemplateLineItem(title: "Glass Enclosure", share: 4),
            TemplateLineItem(title: "Towel Warmer", share: 1),
            TemplateLineItem(title: "Linen Storage / Cabinetry", share: 2.5)
        ]),
        TemplateCategory(name: "Paint & Finish", systemImage: "paintbrush", percent: 10, items: [
            TemplateLineItem(title: "Paint and Drywall Repair", share: 4),
            TemplateLineItem(title: "Mirror", share: 2),
            TemplateLineItem(title: "Bath Accessories (TP Holder, Hooks, Hardware)", share: 1.5),
            TemplateLineItem(title: "Final Clean and Punch List", share: 2.5)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let basementFinish = ProjectTemplate(
    type: .basementFinish,
    title: "Basement Finish",
    subtitle: "Finished basement or lower level",
    typicalRange: "$80k - $350k",
    systemImage: "stairs",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text", percent: 6, items: [
            TemplateLineItem(title: "Design and Layout", share: 2.5),
            TemplateLineItem(title: "Building Permit", share: 1.5),
            TemplateLineItem(title: "Electrical and Plumbing Permits", share: 1),
            TemplateLineItem(title: "Inspection Fees", share: 1)
        ]),
        TemplateCategory(name: "Framing", systemImage: "house.lodge", percent: 16, items: [
            TemplateLineItem(title: "Layout and Framing", share: 9),
            TemplateLineItem(title: "Egress Window (Required for Bedrooms)", share: 5),
            TemplateLineItem(title: "Pocket Doors and Specialty Framing", share: 2)
        ]),
        TemplateCategory(name: "MEP Rough-In", systemImage: "bolt", percent: 22, items: [
            TemplateLineItem(title: "Plumbing Rough-In", share: 6),
            TemplateLineItem(title: "Electrical Rough-In", share: 6),
            TemplateLineItem(title: "HVAC and Ductwork", share: 6),
            TemplateLineItem(title: "Sump Pump (New or Replace)", share: 1.5),
            TemplateLineItem(title: "Dehumidifier and Drainage", share: 1.5),
            TemplateLineItem(title: "Theater and Speaker Pre-Wiring (Optional)", share: 1)
        ]),
        TemplateCategory(name: "Insulation & Drywall", systemImage: "rectangle.split.3x1", percent: 18, items: [
            TemplateLineItem(title: "Wall and Ceiling Insulation", share: 6),
            TemplateLineItem(title: "Vapor Barrier", share: 2),
            TemplateLineItem(title: "Soundproofing (Between Floors)", share: 2),
            TemplateLineItem(title: "Drywall (or Drop Ceiling Option)", share: 8)
        ]),
        TemplateCategory(name: "Flooring & Trim", systemImage: "square.grid.3x3", percent: 16, items: [
            TemplateLineItem(title: "Flooring (LVP, Carpet, Tile)", share: 9),
            TemplateLineItem(title: "Gym Area Flooring and Mirrors", share: 2),
            TemplateLineItem(title: "Doors and Trim", share: 5)
        ]),
        TemplateCategory(name: "Bath / Wet Bar / Specialty", systemImage: "sink", percent: 14, items: [
            TemplateLineItem(title: "Bath Fixtures", share: 5),
            TemplateLineItem(title: "Wet Bar Cabinetry and Counters", share: 4),
            TemplateLineItem(title: "Wet Bar Appliances (Beverage Fridge, Ice Maker)", share: 2),
            TemplateLineItem(title: "Home Theater AV and Cinema Seating", share: 2),
            TemplateLineItem(title: "Built-Ins and Specialty Storage", share: 1)
        ]),
        TemplateCategory(name: "Paint & Closeout", systemImage: "paintbrush", percent: 8, items: [
            TemplateLineItem(title: "Paint", share: 4),
            TemplateLineItem(title: "Final Clean and Punch List", share: 4)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let majorRenovation = ProjectTemplate(
    type: .majorRenovation,
    title: "Major Renovation",
    subtitle: "Whole-home renovation",
    typicalRange: "$250k - $1.5M+",
    systemImage: "house.and.flag",
    categories: [
        TemplateCategory(name: "Soft Costs", systemImage: "doc.text.magnifyingglass", percent: 10, items: [
            TemplateLineItem(title: "Architect", share: 2.2),
            TemplateLineItem(title: "Structural and MEP Engineering", share: 1.3),
            TemplateLineItem(title: "Permits and Filings", share: 1.2),
            TemplateLineItem(title: "Owner's Representative / Project Management", share: 0.8),
            TemplateLineItem(title: "Builder's Risk and Owner's Insurance", share: 0.7),
            TemplateLineItem(title: "Construction Loan Interest", share: 0.8),
            TemplateLineItem(title: "Temporary Living (Rental or Hotel)", share: 2.5),
            TemplateLineItem(title: "Storage / POD Rental and Moving", share: 0.5)
        ]),
        TemplateCategory(name: "Demo & Remediation", systemImage: "hammer", percent: 12, items: [
            TemplateLineItem(title: "Demo", share: 5),
            TemplateLineItem(title: "Asbestos / Lead / Mold Remediation", share: 4),
            TemplateLineItem(title: "Protection and Dust Containment", share: 1.5),
            TemplateLineItem(title: "Dumpster and Haul-Off", share: 1.5)
        ]),
        TemplateCategory(name: "Structural", systemImage: "house.lodge", percent: 12, items: [
            TemplateLineItem(title: "Framing", share: 5),
            TemplateLineItem(title: "Steel and Engineered Beams", share: 3.5),
            TemplateLineItem(title: "Structural Repairs and Sistering", share: 3.5)
        ]),
        TemplateCategory(name: "Exterior", systemImage: "rectangle.portrait.and.arrow.right", percent: 9, items: [
            TemplateLineItem(title: "Windows and Exterior Doors", share: 4),
            TemplateLineItem(title: "Roofing", share: 3),
            TemplateLineItem(title: "Siding and Trim", share: 2)
        ]),
        TemplateCategory(name: "MEP Systems", systemImage: "bolt", percent: 21, items: [
            TemplateLineItem(title: "Plumbing", share: 7),
            TemplateLineItem(title: "Electrical (Including Service Upgrade)", share: 7),
            TemplateLineItem(title: "HVAC and Ductwork", share: 5),
            TemplateLineItem(title: "Smart Home and Low-Voltage", share: 1),
            TemplateLineItem(title: "Solar / EV / Generator Pre-Wiring", share: 1)
        ]),
        TemplateCategory(name: "Interior Finishes", systemImage: "paintbrush", percent: 28, items: [
            TemplateLineItem(title: "Insulation", share: 1.5),
            TemplateLineItem(title: "Drywall", share: 3.5),
            TemplateLineItem(title: "Trim, Doors and Millwork", share: 3),
            TemplateLineItem(title: "Kitchen Cabinets and Countertops", share: 5.5),
            TemplateLineItem(title: "Bath Vanities and Fixtures", share: 3),
            TemplateLineItem(title: "Tile", share: 2.5),
            TemplateLineItem(title: "Flooring", share: 3),
            TemplateLineItem(title: "Paint", share: 2),
            TemplateLineItem(title: "Appliances", share: 2.5),
            TemplateLineItem(title: "Lighting Fixtures", share: 0.8),
            TemplateLineItem(title: "Window Treatments and Closet Systems", share: 0.7)
        ]),
        TemplateCategory(name: "Final & Site", systemImage: "checkmark.seal", percent: 8, items: [
            TemplateLineItem(title: "Landscaping Repair", share: 2.5),
            TemplateLineItem(title: "Driveway and Walkways", share: 2),
            TemplateLineItem(title: "Final Inspections and C/O", share: 1),
            TemplateLineItem(title: "Final Clean", share: 1),
            TemplateLineItem(title: "Punch List Reserve", share: 1.5)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let addition = ProjectTemplate(
    type: .addition,
    title: "Addition",
    subtitle: "New space tied into existing home",
    typicalRange: "$150k - $800k",
    systemImage: "plus.square.on.square",
    categories: [
        TemplateCategory(name: "Soft Costs", systemImage: "doc.text.magnifyingglass", percent: 8, items: [
            TemplateLineItem(title: "Architect", share: 2.5),
            TemplateLineItem(title: "Structural Engineering", share: 1.5),
            TemplateLineItem(title: "Survey and Site Plan", share: 1),
            TemplateLineItem(title: "Building Permit", share: 1.5),
            TemplateLineItem(title: "Electrical and Plumbing Permits", share: 1),
            TemplateLineItem(title: "Builder's Risk Insurance", share: 0.5)
        ]),
        TemplateCategory(name: "Site & Foundation", systemImage: "square.stack.3d.down.right", percent: 17, items: [
            TemplateLineItem(title: "Excavation", share: 5),
            TemplateLineItem(title: "Footings", share: 5),
            TemplateLineItem(title: "Foundation Walls and Slab", share: 6),
            TemplateLineItem(title: "Septic / Sewer Upgrades (If Applicable)", share: 1)
        ]),
        TemplateCategory(name: "Framing", systemImage: "house.lodge", percent: 17, items: [
            TemplateLineItem(title: "Framing Material", share: 7),
            TemplateLineItem(title: "Framing Labor", share: 6),
            TemplateLineItem(title: "Roofline Tie-In and Existing Roof Modification", share: 3),
            TemplateLineItem(title: "Wall Cut-In to Existing Structure", share: 1)
        ]),
        TemplateCategory(name: "Exterior", systemImage: "rectangle.portrait.and.arrow.right", percent: 13, items: [
            TemplateLineItem(title: "Roofing (Tied Into Existing)", share: 4),
            TemplateLineItem(title: "Windows and Doors", share: 4),
            TemplateLineItem(title: "Siding (Matching Existing)", share: 4),
            TemplateLineItem(title: "Exterior Paint Touch-Up", share: 1)
        ]),
        TemplateCategory(name: "MEP Rough-In", systemImage: "bolt", percent: 18, items: [
            TemplateLineItem(title: "Plumbing Rough-In", share: 5),
            TemplateLineItem(title: "Electrical Rough-In", share: 5),
            TemplateLineItem(title: "Electrical Service Upgrade (Panel)", share: 2),
            TemplateLineItem(title: "HVAC Equipment", share: 4),
            TemplateLineItem(title: "HVAC Modifications to Existing System", share: 2)
        ]),
        TemplateCategory(name: "Interior Finishes", systemImage: "paintbrush", percent: 21, items: [
            TemplateLineItem(title: "Insulation", share: 1.5),
            TemplateLineItem(title: "Drywall", share: 4),
            TemplateLineItem(title: "Trim, Doors and Millwork", share: 3),
            TemplateLineItem(title: "Flooring (Matching Existing)", share: 5),
            TemplateLineItem(title: "Paint", share: 3),
            TemplateLineItem(title: "Lighting Fixtures", share: 1.5),
            TemplateLineItem(title: "Cabinets / Built-Ins (If Applicable)", share: 3)
        ]),
        TemplateCategory(name: "Final & Site", systemImage: "checkmark.seal", percent: 6, items: [
            TemplateLineItem(title: "Landscaping Repair", share: 2),
            TemplateLineItem(title: "Final Inspections and C/O", share: 1),
            TemplateLineItem(title: "Final Clean", share: 1.5),
            TemplateLineItem(title: "Punch List Reserve", share: 1.5)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let garageBuild = ProjectTemplate(
    type: .garageBuild,
    title: "Garage Build",
    subtitle: "Detached or attached garage",
    typicalRange: "$75k - $350k",
    systemImage: "car",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text", percent: 6, items: [
            TemplateLineItem(title: "Design and Plans", share: 2.5),
            TemplateLineItem(title: "Permits and Survey", share: 2.5),
            TemplateLineItem(title: "Inspection Fees", share: 1)
        ]),
        TemplateCategory(name: "Site & Foundation", systemImage: "square.stack.3d.down.right", percent: 22, items: [
            TemplateLineItem(title: "Excavation and Site Prep", share: 5),
            TemplateLineItem(title: "Footings", share: 5),
            TemplateLineItem(title: "Slab and Vapor Barrier", share: 9),
            TemplateLineItem(title: "Apron and Driveway Transition", share: 3)
        ]),
        TemplateCategory(name: "Framing", systemImage: "house.lodge", percent: 22, items: [
            TemplateLineItem(title: "Framing Material", share: 11),
            TemplateLineItem(title: "Framing Labor", share: 9),
            TemplateLineItem(title: "Engineered Beams and Headers", share: 2)
        ]),
        TemplateCategory(name: "Exterior", systemImage: "rectangle.portrait.and.arrow.right", percent: 18, items: [
            TemplateLineItem(title: "Roofing", share: 7),
            TemplateLineItem(title: "Siding", share: 7),
            TemplateLineItem(title: "Windows", share: 2),
            TemplateLineItem(title: "Service Door", share: 2)
        ]),
        TemplateCategory(name: "Garage Doors", systemImage: "door.garage.closed", percent: 10, items: [
            TemplateLineItem(title: "Garage Doors", share: 6),
            TemplateLineItem(title: "Insulated Door Upgrade", share: 2),
            TemplateLineItem(title: "Openers and Smart Controls", share: 2)
        ]),
        TemplateCategory(name: "Electrical & Finish", systemImage: "bolt", percent: 16, items: [
            TemplateLineItem(title: "Electrical Rough-In and Service", share: 5),
            TemplateLineItem(title: "EV Charger Circuit (240V)", share: 1.5),
            TemplateLineItem(title: "220V Workshop Outlets", share: 1),
            TemplateLineItem(title: "Lighting (LED Fixtures)", share: 2),
            TemplateLineItem(title: "Utility Sink (If Applicable)", share: 1),
            TemplateLineItem(title: "Insulation and Drywall", share: 4),
            TemplateLineItem(title: "Storage Systems (Slat Wall, Cabinets)", share: 1.5)
        ]),
        TemplateCategory(name: "Final Site", systemImage: "checkmark.seal", percent: 6, items: [
            TemplateLineItem(title: "Driveway Tie-In", share: 3),
            TemplateLineItem(title: "Landscaping Touch-Up", share: 1.5),
            TemplateLineItem(title: "Final Clean and Punch", share: 1.5)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
)

private let landscapingHardscape = ProjectTemplate(
    type: .landscapingHardscape,
    title: "Landscaping / Hardscape",
    subtitle: "Outdoor grading, planting and masonry",
    typicalRange: "$40k - $400k",
    systemImage: "leaf",
    categories: [
        TemplateCategory(name: "Design & Permits", systemImage: "doc.text", percent: 5, items: [
            TemplateLineItem(title: "Design and Layout", share: 3),
            TemplateLineItem(title: "Permits and Survey", share: 2)
        ]),
        TemplateCategory(name: "Site Prep", systemImage: "hammer", percent: 14, items: [
            TemplateLineItem(title: "Clearing and Demo", share: 3),
            TemplateLineItem(title: "Tree Removal (Often the #1 Surprise Cost)", share: 4),
            TemplateLineItem(title: "Tree Care and Pruning (Keepers)", share: 1),
            TemplateLineItem(title: "Rough Grading", share: 4),
            TemplateLineItem(title: "Drainage Prep and Sediment Control", share: 2)
        ]),
        TemplateCategory(name: "Drainage & Utilities", systemImage: "drop", percent: 13, items: [
            TemplateLineItem(title: "Drainage System", share: 5),
            TemplateLineItem(title: "Irrigation", share: 5),
            TemplateLineItem(title: "Smart Irrigation Controller", share: 1),
            TemplateLineItem(title: "Lighting Rough-In", share: 2)
        ]),
        TemplateCategory(name: "Hardscape", systemImage: "square.grid.3x3", percent: 32, items: [
            TemplateLineItem(title: "Pavers and Patio", share: 14),
            TemplateLineItem(title: "Retaining and Sitting Walls", share: 8),
            TemplateLineItem(title: "Steps and Masonry", share: 6),
            TemplateLineItem(title: "Edging and Bordering", share: 2),
            TemplateLineItem(title: "Stone Veneer and Specialty Masonry", share: 2)
        ]),
        TemplateCategory(name: "Plantings", systemImage: "leaf", percent: 18, items: [
            TemplateLineItem(title: "Trees", share: 5),
            TemplateLineItem(title: "Shrubs and Perennials", share: 4),
            TemplateLineItem(title: "Sod, Seed or Hydroseed", share: 4),
            TemplateLineItem(title: "Soil Amendments and Topsoil", share: 3),
            TemplateLineItem(title: "Mulch and Bed Prep", share: 2)
        ]),
        TemplateCategory(name: "Lighting & Features", systemImage: "lightbulb", percent: 11, items: [
            TemplateLineItem(title: "Landscape Lighting Fixtures", share: 4),
            TemplateLineItem(title: "Fire or Water Features", share: 4),
            TemplateLineItem(title: "Outdoor Furniture and Pots", share: 3)
        ]),
        TemplateCategory(name: "Finish", systemImage: "checkmark.seal", percent: 7, items: [
            TemplateLineItem(title: "Final Clean and Restoration", share: 4),
            TemplateLineItem(title: "Punch List and Walkthrough", share: 3)
        ])
    ],
    photoFolders: PhotoFormViewModel.photoFolderOptions,
    documentKinds: ProjectDocumentKind.allCases
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
