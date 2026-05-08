import Foundation

enum RoomCatalog {
    static let general = "General"

    static func rooms(for project: Project) -> [String] {
        rooms(for: project.templateType)
    }

    static func rooms(for templateType: ProjectTemplateType) -> [String] {
        switch templateType {
        case .customHome, .majorRenovation, .addition:
            [general, "Kitchen", "Dining", "Living Room", "Primary Suite", "Bedroom", "Bathroom", "Basement", "Garage", "Exterior", "Site"]
        case .poolBackyard:
            [general, "Pool", "Patio", "Outdoor Kitchen", "Equipment", "Landscape", "Site"]
        case .deckPatio:
            [general, "Deck", "Patio", "Stairs & Railings", "Hardscape", "Landscape", "Site"]
        case .kitchenRemodel:
            [general, "Kitchen", "Dining", "Pantry"]
        case .bathroomRemodel:
            [general, "Bathroom", "Primary Bath", "Powder Room"]
        case .basementFinish:
            [general, "Basement", "Bathroom", "Utility"]
        case .garageBuild:
            [general, "Garage", "Driveway", "Exterior", "Site"]
        case .landscapingHardscape:
            [general, "Front Yard", "Backyard", "Patio", "Driveway", "Planting", "Site"]
        case .custom:
            [general]
        }
    }

    static func inferredRoom(title: String, category: String, project: Project) -> String {
        inferredRoom(title: title, category: category, templateType: project.templateType)
    }

    static func inferredRoom(title: String, category: String, templateType: ProjectTemplateType) -> String {
        let text = "\(title) \(category)".localizedLowercase
        let allowed = Set(rooms(for: templateType))

        func room(_ value: String) -> String? {
            allowed.contains(value) ? value : nil
        }

        switch templateType {
        case .poolBackyard:
            if text.contains("equipment") || text.contains("pump") || text.contains("heater") || text
                .contains("automation") { return room("Equipment") ?? general }
            if text.contains("patio") || text.contains("paver") || text.contains("coping") || text
                .contains("hardscape") { return room("Patio") ?? general }
            if text.contains("kitchen") || text.contains("grill") { return room("Outdoor Kitchen") ?? general }
            if text.contains("landscap") || text.contains("plant") { return room("Landscape") ?? general }
            if text.contains("pool") || text.contains("shell") || text.contains("tile") { return room("Pool") ?? general }
            if text.contains("site") || text.contains("demo") || text.contains("permit") || text
                .contains("excav") { return room("Site") ?? general }
            return general
        case .deckPatio:
            if text.contains("rail") || text.contains("stair") { return room("Stairs & Railings") ?? general }
            if text.contains("deck") { return room("Deck") ?? general }
            if text.contains("patio") { return room("Patio") ?? general }
            if text.contains("hardscape") || text.contains("paver") || text.contains("masonry") { return room("Hardscape") ?? general }
            if text.contains("landscap") || text.contains("plant") { return room("Landscape") ?? general }
            if text.contains("site") || text.contains("permit") { return room("Site") ?? general }
            return general
        case .kitchenRemodel:
            if text.contains("pantry") { return room("Pantry") ?? general }
            if text.contains("dining") { return room("Dining") ?? general }
            return room("Kitchen") ?? general
        case .bathroomRemodel:
            if text.contains("powder") { return room("Powder Room") ?? general }
            if text.contains("primary") || text.contains("master") { return room("Primary Bath") ?? general }
            return room("Bathroom") ?? general
        case .basementFinish:
            if text.contains("bath") { return room("Bathroom") ?? general }
            if text.contains("utility") || text.contains("mechanical") { return room("Utility") ?? general }
            return room("Basement") ?? general
        case .garageBuild:
            if text.contains("driveway") { return room("Driveway") ?? general }
            if text.contains("exterior") || text.contains("siding") || text.contains("roof") { return room("Exterior") ?? general }
            if text.contains("site") || text.contains("permit") || text.contains("foundation") { return room("Site") ?? general }
            return room("Garage") ?? general
        case .landscapingHardscape:
            if text.contains("front") { return room("Front Yard") ?? general }
            if text.contains("back") { return room("Backyard") ?? general }
            if text.contains("driveway") { return room("Driveway") ?? general }
            if text.contains("patio") || text.contains("paver") || text.contains("hardscape") { return room("Patio") ?? general }
            if text.contains("plant") || text.contains("landscap") { return room("Planting") ?? general }
            return room("Site") ?? general
        case .customHome, .majorRenovation, .addition:
            if text.contains("kitchen") || text.contains("cabinet") || text.contains("counter") || text
                .contains("appliance") { return room("Kitchen") ?? general }
            if text.contains("dining") { return room("Dining") ?? general }
            if text.contains("living") || text.contains("fireplace") { return room("Living Room") ?? general }
            if text.contains("primary") || text.contains("master") { return room("Primary Suite") ?? general }
            if text.contains("bedroom") { return room("Bedroom") ?? general }
            if text.contains("bath") || text.contains("plumbing fixture") { return room("Bathroom") ?? general }
            if text.contains("basement") { return room("Basement") ?? general }
            if text.contains("garage") { return room("Garage") ?? general }
            if text.contains("exterior") || text.contains("roof") || text.contains("window") || text.contains("door") || text
                .contains("landscap") { return room("Exterior") ?? general }
            if text.contains("site") || text.contains("foundation") || text.contains("excav") || text
                .contains("permit") { return room("Site") ?? general }
            return general
        case .custom:
            return general
        }
    }
}
