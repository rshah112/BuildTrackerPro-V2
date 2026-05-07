import Foundation
import SwiftData
import SwiftUI

@main
@MainActor
struct HomeBuildProApp: App {
    private let container: ModelContainer

    init() {
        TextFieldSelectionBehavior.enableSelectAllOnFocus()

        do {
            #if DEBUG
                try Self.resetDevelopmentStoreIfNeeded()
            #endif
            container = try Self.makeContainer()
            SeedData.ensureSeeded(in: container.mainContext)
            // Attach undo AFTER seeding so the seed isn't on the undo stack.
            container.mainContext.undoManager = UndoManager()
        } catch {
            #if DEBUG
                do {
                    try Self.resetDevelopmentStore()
                    container = try Self.makeContainer()
                    SeedData.ensureSeeded(in: container.mainContext)
                    container.mainContext.undoManager = UndoManager()
                } catch {
                    fatalError("Could not create SwiftData container after resetting development store: \(error.localizedDescription)")
                }
            #else
                fatalError("Could not create SwiftData container: \(error.localizedDescription)")
            #endif
        }
    }

    @AppStorage(AppSettingsKeys.preferLargeControls) private var preferLargeControls = true

    var body: some Scene {
        WindowGroup {
            PortfolioView()
                .environment(\.controlSize, preferLargeControls ? .large : .regular)
        }
        .modelContainer(container)
    }

    private static var appSchema: Schema {
        Schema([
            Project.self,
            BudgetCategory.self,
            BudgetLineItem.self,
            Expense.self,
            Vendor.self,
            PhotoAttachment.self,
            ChangeOrder.self,
            ProjectDocument.self
        ])
    }

    private static func makeContainer() throws -> ModelContainer {
        let configuration = ModelConfiguration("HomeBuildPro", schema: appSchema, isStoredInMemoryOnly: false)
        return try ModelContainer(for: appSchema, configurations: [configuration])
    }

    #if DEBUG
        private static let developmentStoreVersion = "2026-05-07-homebuild-pro-rename"

        private static var applicationSupportURL: URL {
            FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
                .first ?? URL(fileURLWithPath: NSTemporaryDirectory())
        }

        private static func resetDevelopmentStoreIfNeeded() throws {
            let arguments = ProcessInfo.processInfo.arguments
            let environment = ProcessInfo.processInfo.environment
            let defaults = UserDefaults.standard
            let requestedReset = arguments.contains("--reset-development-store") || environment["RESET_SWIFTDATA_STORE"] == "1"
            let storedVersion = defaults.string(forKey: "HomeBuildProDevelopmentStoreVersion")

            guard requestedReset || storedVersion != developmentStoreVersion else { return }

            try resetDevelopmentStore()
            defaults.set(developmentStoreVersion, forKey: "HomeBuildProDevelopmentStoreVersion")
        }

        private static func resetDevelopmentStore() throws {
            let storeItems = (try? FileManager.default.contentsOfDirectory(at: applicationSupportURL, includingPropertiesForKeys: nil)) ??
                []
            for url in storeItems
                where url.lastPathComponent.hasPrefix("HomeBuildPro.store") || url.lastPathComponent
                .hasPrefix("BuilderTrackerPro.store") || url.lastPathComponent.hasPrefix("default.store")
            {
                try FileManager.default.removeItem(at: url)
            }
        }
    #endif
}
