import Foundation
import SwiftData

enum ProjectStatus: String, CaseIterable, Identifiable {
    case planning
    case active
    case paused
    case complete

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .planning: "Planning"
        case .active: "Active"
        case .paused: "Paused"
        case .complete: "Complete"
        }
    }

    var systemImage: String {
        switch self {
        case .planning: "pencil.and.list.clipboard"
        case .active: "hammer"
        case .paused: "pause.circle"
        case .complete: "checkmark.seal"
        }
    }
}

enum ProjectPriority: String, CaseIterable, Identifiable {
    case low
    case normal
    case high
    case urgent

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .low: "Low"
        case .normal: "Normal"
        case .high: "High"
        case .urgent: "Urgent"
        }
    }
}

@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var name: String
    var address: String
    var statusRawValue: String = ProjectStatus.planning.rawValue
    var priorityRawValue: String = ProjectPriority.normal.rawValue
    var templateTypeRawValue: String = ProjectTemplateType.custom.rawValue
    var purchasePrice: Double = 0
    var squareFootage: Double?
    var lotDimensions: String = ""
    var proposedBuildDimensions: String = ""
    var footprint: String
    var stories: Int
    var basement: String
    var scopeSummary: String = ""
    var warrantyNotes: String = ""
    var startDate: Date?
    var targetFinishDate: Date?
    var constructionBudget: Double
    var contingencyBudget: Double
    var createdAt: Date
    var deletedAt: Date?

    init(
        id: UUID = UUID(),
        name: String,
        address: String,
        status: ProjectStatus = .planning,
        priority: ProjectPriority = .normal,
        templateType: ProjectTemplateType = .custom,
        purchasePrice: Double = 0,
        squareFootage: Double? = nil,
        lotDimensions: String = "",
        proposedBuildDimensions: String = "",
        footprint: String,
        stories: Int,
        basement: String,
        scopeSummary: String = "",
        warrantyNotes: String = "",
        startDate: Date? = nil,
        targetFinishDate: Date? = nil,
        constructionBudget: Double,
        contingencyBudget: Double,
        createdAt: Date = .now,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.address = address
        statusRawValue = status.rawValue
        priorityRawValue = priority.rawValue
        templateTypeRawValue = templateType.rawValue
        self.purchasePrice = purchasePrice
        self.squareFootage = squareFootage
        self.lotDimensions = lotDimensions
        self.proposedBuildDimensions = proposedBuildDimensions
        self.footprint = footprint
        self.stories = stories
        self.basement = basement
        self.scopeSummary = scopeSummary
        self.warrantyNotes = warrantyNotes
        self.startDate = startDate
        self.targetFinishDate = targetFinishDate
        self.constructionBudget = constructionBudget
        self.contingencyBudget = contingencyBudget
        self.createdAt = createdAt
        self.deletedAt = deletedAt
    }

    var status: ProjectStatus {
        get { ProjectStatus(rawValue: statusRawValue) ?? .planning }
        set { statusRawValue = newValue.rawValue }
    }

    var priority: ProjectPriority {
        get { ProjectPriority(rawValue: priorityRawValue) ?? .normal }
        set { priorityRawValue = newValue.rawValue }
    }

    var templateType: ProjectTemplateType {
        get { ProjectTemplateType(rawValue: templateTypeRawValue) ?? .custom }
        set { templateTypeRawValue = newValue.rawValue }
    }

    var isInTrash: Bool {
        deletedAt != nil
    }

    /// Days a soft-deleted project stays in Trash before auto-purge.
    static let trashRetentionDays: Int = 30
}

// MARK: - Soft delete + permanent delete

extension Project {
    /// Marks the project as deleted. Reversible via `restore()` until auto-purge runs at
    /// `trashRetentionDays` past the deletion date. Child entities (budget, expenses, photos, etc.)
    /// are kept intact so restore brings everything back; queries against children should filter
    /// by their owning project's `deletedAt == nil` when relevant (Portfolio sums, insights).
    func softDelete(at date: Date = .now) {
        deletedAt = date
    }

    func restore() {
        deletedAt = nil
    }

    /// Cascading hard delete. Removes all related entities owned by this project and wipes the
    /// on-disk media mirror. Called from Trash's "Delete Permanently" and from `purgeExpiredSoftDeleted`.
    /// Returns true if the delete + save succeeded; false if it had to roll back.
    @MainActor
    @discardableResult
    func permanentlyDelete(in context: ModelContext) -> Bool {
        let projectID = id
        let mediaFolder = MediaStorageService.projectFolder(project: self)

        let categories = (try? context.fetch(FetchDescriptor<BudgetCategory>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let items = (try? context.fetch(FetchDescriptor<BudgetLineItem>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let expenses = (try? context.fetch(FetchDescriptor<Expense>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let vendors = (try? context.fetch(FetchDescriptor<Vendor>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let photos = (try? context.fetch(FetchDescriptor<PhotoAttachment>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let documents = (try? context.fetch(FetchDescriptor<ProjectDocument>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let allowanceSelections = (try? context
            .fetch(FetchDescriptor<AllowanceSelection>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let tasks = (try? context.fetch(FetchDescriptor<ProjectTask>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let changeOrders = (try? context.fetch(FetchDescriptor<ChangeOrder>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let bidPackages = (try? context.fetch(FetchDescriptor<BidPackage>(predicate: #Predicate { $0.projectID == projectID }))) ?? []
        let bids = (try? context.fetch(FetchDescriptor<Bid>(predicate: #Predicate { $0.projectID == projectID }))) ?? []

        categories.forEach(context.delete)
        items.forEach(context.delete)
        expenses.forEach(context.delete)
        vendors.forEach(context.delete)
        photos.forEach(context.delete)
        documents.forEach(context.delete)
        allowanceSelections.forEach(context.delete)
        tasks.forEach(context.delete)
        changeOrders.forEach(context.delete)
        bidPackages.forEach(context.delete)
        bids.forEach(context.delete)
        context.delete(self)

        do {
            try context.save()
            MediaStorageService.removeAllMedia(at: mediaFolder)
            return true
        } catch {
            // Save failed: roll back so the deleted entities reappear in the in-memory context.
            // The on-disk media folder is left intact since we haven't confirmed the DB delete.
            context.safeRollback()
            return false
        }
    }

    /// Hard-deletes any project soft-deleted more than `trashRetentionDays` ago. Safe to call
    /// from launch. No-op if the context can't be queried.
    ///
    /// We do the date comparison in Swift rather than in #Predicate because SwiftData's macro
    /// expansion does not handle optional-Date comparison with a captured non-optional cutoff
    /// reliably across iOS versions — force-unwrap inside the predicate can produce stale
    /// SQL or silently match no rows.
    @MainActor
    static func purgeExpiredSoftDeleted(in context: ModelContext) {
        let cutoff = Calendar.current.date(byAdding: .day, value: -trashRetentionDays, to: .now) ?? .distantPast
        let descriptor = FetchDescriptor<Project>(
            predicate: #Predicate { project in project.deletedAt != nil }
        )
        let candidates = (try? context.fetch(descriptor)) ?? []
        let expired = candidates.filter { project in
            guard let deletedAt = project.deletedAt else { return false }
            return deletedAt < cutoff
        }
        for project in expired {
            project.permanentlyDelete(in: context)
        }
    }
}
