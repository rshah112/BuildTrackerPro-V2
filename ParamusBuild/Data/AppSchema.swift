import Foundation
import SwiftData

/// Versioned schema for HomeBuild Pro's SwiftData store.
///
/// Why this exists even before we've shipped: declaring a versioned schema NOW means the next
/// schema change (adding a property, renaming, splitting a model) can ship as a
/// `MigrationStage.lightweight` or `.custom` without users' stores blowing up on update.
/// Retrofitting this AFTER a real ship is much harder than starting with it.
///
/// When you change the schema:
///   1. Create `enum AppSchemaV2: VersionedSchema` (and so on) below this declaration.
///   2. Make the actual change in the live `@Model` class files.
///   3. Add an entry to `HomeBuildProMigrationPlan.stages` describing how V1 → V2 maps:
///      - `.lightweight(fromVersion: AppSchemaV1.self, toVersion: AppSchemaV2.self)` for purely
///        additive changes (new optional property, new entity).
///      - `.custom(...)` with `willMigrate` / `didMigrate` closures for anything that needs
///        data transformation.
///   4. Bump `developmentStoreVersion` in `HomeBuildProApp` so DEBUG builds rewrite their
///      dev store on next launch.
enum AppSchemaV1: VersionedSchema {
    static let versionIdentifier = Schema.Version(1, 0, 0)

    static var models: [any PersistentModel.Type] {
        [
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
        ]
    }
}

enum HomeBuildProMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [AppSchemaV1.self]
    }

    static var stages: [MigrationStage] {
        []
    }
}
