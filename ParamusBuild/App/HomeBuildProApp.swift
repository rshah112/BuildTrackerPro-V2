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

    /// Versioned schema — see `AppSchema.swift` for how to add V2 etc. when the schema changes.
    private static var appSchema: Schema {
        Schema(versionedSchema: AppSchemaV1.self)
    }

    private static func makeContainer() throws -> ModelContainer {
        // Explicitly opt OUT of SwiftData ↔ CloudKit mirroring. The iCloud entitlement
        // on this app is only for CloudDocuments (BackupService writes rotating ZIPs
        // to the iCloud Drive ubiquity container — that's file I/O, unrelated to
        // SwiftData). Without `.none` here, SwiftData sees the iCloud container
        // identifier in the entitlement and auto-enables CloudKit mirroring, which
        // then refuses to load the store because our models use `@Attribute(.unique)`
        // and non-optional fields (both forbidden in CloudKit-backed schemas).
        let configuration = ModelConfiguration(
            "HomeBuildPro",
            schema: appSchema,
            isStoredInMemoryOnly: false,
            cloudKitDatabase: .none
        )
        return try ModelContainer(
            for: appSchema,
            migrationPlan: HomeBuildProMigrationPlan.self,
            configurations: configuration
        )
    }

    #if DEBUG
        /// Bump this string whenever the SwiftData schema changes during development. DEBUG
        /// builds will auto-wipe their store on next launch when this differs from the last
        /// value persisted to UserDefaults. Lets simulator iteration stay painless without
        /// hitting DataRecoveryView every schema bump.
        private static let developmentStoreVersion = "2026-05-11-phase14-versioned-schema"

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
