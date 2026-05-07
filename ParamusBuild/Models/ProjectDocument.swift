import Foundation
import SwiftData

enum ProjectDocumentKind: String, CaseIterable, Identifiable {
    case survey
    case approvals
    case plans
    case inspections
    case contractsInsurance
    case receiptsWarranties
    case other

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .survey: "Survey"
        case .approvals: "Permits & Approvals"
        case .plans: "Plans"
        case .inspections: "Inspections"
        case .contractsInsurance: "Contracts & Insurance"
        case .receiptsWarranties: "Receipts & Warranties"
        case .other: "Other"
        }
    }

    static var requiredForProjectSetup: [ProjectDocumentKind] {
        [.survey, .approvals, .plans, .contractsInsurance]
    }

    static func normalized(rawValue: String) -> ProjectDocumentKind {
        switch rawValue {
        case "permit", "permits", "zoning":
            .approvals
        case "architectPlans", "structuralPlans", "mepPlans", "engineeringPlans":
            .plans
        case "insurance", "contracts":
            .contractsInsurance
        case "receipts", "warranties":
            .receiptsWarranties
        default:
            ProjectDocumentKind(rawValue: rawValue) ?? .other
        }
    }
}

enum ProjectDocumentStatus: String, CaseIterable, Identifiable {
    case required
    case received
    case missing

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .required: "Required"
        case .received: "Received"
        case .missing: "Missing"
        }
    }
}

@Model
final class ProjectDocument {
    @Attribute(.unique) var id: UUID
    var projectID: UUID = UUID()
    var fileName: String
    var kindRawValue: String
    var statusRawValue: String = ProjectDocumentStatus.received.rawValue
    var notes: String
    var budgetLineItemID: UUID?
    var budgetLineItemTitle: String
    var uploadedAt: Date
    @Attribute(.externalStorage) var fileData: Data?

    init(
        id: UUID = UUID(),
        projectID: UUID,
        fileName: String,
        kind: ProjectDocumentKind,
        status: ProjectDocumentStatus = .received,
        notes: String = "",
        budgetLineItemID: UUID? = nil,
        budgetLineItemTitle: String = "",
        uploadedAt: Date = .now,
        fileData: Data?
    ) {
        self.id = id
        self.projectID = projectID
        self.fileName = fileName
        kindRawValue = kind.rawValue
        statusRawValue = status.rawValue
        self.notes = notes
        self.budgetLineItemID = budgetLineItemID
        self.budgetLineItemTitle = budgetLineItemTitle
        self.uploadedAt = uploadedAt
        self.fileData = fileData
    }

    var kind: ProjectDocumentKind {
        get { ProjectDocumentKind.normalized(rawValue: kindRawValue) }
        set { kindRawValue = newValue.rawValue }
    }

    var status: ProjectDocumentStatus {
        get { ProjectDocumentStatus(rawValue: statusRawValue) ?? .received }
        set { statusRawValue = newValue.rawValue }
    }
}
