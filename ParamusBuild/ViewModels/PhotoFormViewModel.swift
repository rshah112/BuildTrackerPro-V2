import Foundation

final class PhotoFormViewModel: ObservableObject {
    @Published var imageData: Data?
    @Published var roomTag = ""
    @Published var phaseTag = "Daily Progress"
    @Published var notes = ""
    @Published var budgetLineItemID: UUID?

    static let defaultFolder = "Daily Progress"

    static let photoFolderOptions = [
        "Before / Existing",
        "Daily Progress",
        "During Work",
        "After / Complete",
        "Demo",
        "Site Work",
        "Utilities",
        "Excavation",
        "Foundation",
        "Waterproofing & Drainage",
        "Underground / Slab MEP",
        "Framing",
        "Roofing",
        "Windows & Doors",
        "Exterior Envelope",
        "Mechanical / HVAC",
        "Plumbing Rough-In",
        "Electrical Rough-In",
        "Low Voltage",
        "Insulation",
        "Drywall",
        "Interior Finishes",
        "Trim & Millwork",
        "Kitchen",
        "Bathrooms & Tile",
        "Flooring",
        "Paint",
        "Garage",
        "Materials & Deliveries",
        "Inspections",
        "Safety / Issues",
        "Deficiencies",
        "Change Orders",
        "Punch List",
        "Warranty / Follow-Up",
        "Final / Handover"
    ]

    let phaseOptions: [String]

    var canSave: Bool {
        imageData != nil
    }

    init(
        imageData: Data? = nil,
        roomTag: String = "",
        phaseTag: String = PhotoFormViewModel.defaultFolder,
        notes: String = "",
        budgetLineItemID: UUID? = nil
    ) {
        phaseOptions = PhotoFormViewModel.photoFolderOptions
        self.imageData = imageData
        self.roomTag = roomTag
        self.phaseTag = phaseTag.trimmed.isEmpty ? PhotoFormViewModel.defaultFolder : phaseTag
        self.notes = notes
        self.budgetLineItemID = budgetLineItemID
    }
}
