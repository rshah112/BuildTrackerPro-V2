import Foundation
import SwiftData
import SwiftUI

@main
@MainActor
struct HomeBuildProApp: App {
    private let container: ModelContainer?
    private let launchFailure: Error?

    init() {
        TextFieldSelectionBehavior.enableSelectAllOnFocus()
        MediaStorageService.ensureBootstrapped()

        do {
            #if DEBUG
                try Self.resetDevelopmentStoreIfNeeded()
            #endif
            let c = try Self.makeContainer()
            SeedData.ensureSeeded(in: c.mainContext)
            SwiftDataBackfillService.runIfNeeded(in: c.mainContext)
            // Attach undo AFTER seeding so the seed isn't on the undo stack.
            c.mainContext.undoManager = UndoManager()
            container = c
            launchFailure = nil
        } catch {
            #if DEBUG
                do {
                    try Self.resetDevelopmentStore()
                    let c = try Self.makeContainer()
                    SeedData.ensureSeeded(in: c.mainContext)
                    SwiftDataBackfillService.runIfNeeded(in: c.mainContext)
                    c.mainContext.undoManager = UndoManager()
                    container = c
                    launchFailure = nil
                } catch let recoveryError {
                    container = nil
                    launchFailure = recoveryError
                }
            #else
                container = nil
                launchFailure = error
            #endif
        }
    }

    @AppStorage(AppSettingsKeys.preferLargeControls) private var preferLargeControls = true

    var body: some Scene {
        WindowGroup {
            rootView
                .environment(\.controlSize, preferLargeControls ? .large : .regular)
        }
    }

    /// We mount `.modelContainer` only on the happy path so a failed container init can't
    /// cascade into a forced crash. The recovery path doesn't need SwiftData at all — it
    /// just reveals folders in Files.app, lists backup snapshots, and can wipe the broken
    /// store file. If the user picks "Start fresh", the next launch re-runs `makeContainer`
    /// with a clean slate.
    @ViewBuilder
    private var rootView: some View {
        if let container, launchFailure == nil {
            PortfolioView()
                .modelContainer(container)
                .task {
                    await onLaunch(context: container.mainContext)
                }
        } else {
            DataRecoveryView(launchFailure: launchFailure ?? UnreachableStoreError())
        }
    }

    private func onLaunch(context: ModelContext) async {
        StorageHealthMonitor.shared.refresh()
        Project.purgeExpiredSoftDeleted(in: context)
        _ = BackupService.performIfDue(reason: .launch, context: context)
        StorageHealthMonitor.shared.refresh()
    }

    /// Synthetic error shown by `DataRecoveryView` when the failure didn't surface a specific
    /// Swift Error (e.g. a code path that nilled `container` without an exception).
    private struct UnreachableStoreError: LocalizedError {
        var errorDescription: String? {
            "The HomeBuild Pro database could not be opened. Your photos, receipts and document files are still on disk and any iCloud Drive backups are unaffected."
        }
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
            ProjectDocument.self,
            AllowanceSelection.self,
            ProjectTask.self,
            BidPackage.self,
            Bid.self
        ])
    }

    private static func makeContainer() throws -> ModelContainer {
        let configuration = ModelConfiguration("HomeBuildPro", schema: appSchema, isStoredInMemoryOnly: false)
        return try ModelContainer(for: appSchema, configurations: [configuration])
    }

    #if DEBUG
        private static let developmentStoreVersion = "2026-05-08-demo-project-reset"

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
