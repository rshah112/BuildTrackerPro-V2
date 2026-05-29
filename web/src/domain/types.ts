// Domain types mirroring ParamusBuild/Models/*.swift.
// Conventions: UUIDs and dates are strings (ISO-8601 for dates); money is a number
// of dollars (see lib/money.ts); the native `.externalStorage` Data? blob fields
// become `*ObjectKey` columns holding the R2 object key (or null). Field names are
// camelCase; the data layer maps to/from snake_case Postgres columns.

import type {
  ProjectStatus,
  ProjectPriority,
  ProjectTemplateType,
  ChangeOrderStatus,
  BidPackageStatus,
  ProjectDocumentKind,
  ProjectDocumentStatus,
  ProjectTaskStatus,
} from './enums'

export type UUID = string
export type ISODateString = string

export interface Project {
  id: UUID
  owner: UUID
  name: string
  address: string
  status: ProjectStatus
  priority: ProjectPriority
  templateType: ProjectTemplateType
  purchasePrice: number
  squareFootage: number | null
  lotDimensions: string
  proposedBuildDimensions: string
  footprint: string
  stories: number
  basement: string
  scopeSummary: string
  warrantyNotes: string
  startDate: ISODateString | null
  targetFinishDate: ISODateString | null
  constructionBudget: number
  contingencyBudget: number
  createdAt: ISODateString
  deletedAt: ISODateString | null
}

export interface BudgetCategory {
  id: UUID
  owner: UUID
  projectID: UUID
  name: string
  sortOrder: number
  targetBudget: number
  systemImage: string
}

export interface BudgetLineItem {
  id: UUID
  owner: UUID
  projectID: UUID
  costCode: string
  title: string
  categoryName: string
  roomTag: string
  budget: number
  actual: number
  committed: number
  notes: string
  isPinned: boolean
  isAllowance: boolean
  allowanceAmount: number
  createdAt: ISODateString
}

export interface Expense {
  id: UUID
  owner: UUID
  projectID: UUID
  amount: number
  amountPaid: number
  vendorName: string
  invoiceNumber: string
  date: ISODateString
  dueDate: ISODateString | null
  expectedPaymentDate: ISODateString | null
  paidDate: ISODateString | null
  paymentMethod: string
  paymentReference: string
  categoryName: string
  roomTag: string
  budgetLineItemID: UUID | null
  budgetLineItemTitle: string
  notes: string
  isPaid: boolean
  receiptObjectKey: string | null
}

export interface Vendor {
  id: UUID
  owner: UUID
  projectID: UUID
  name: string
  trade: string
  phone: string
  email: string
  notes: string
}

export interface ChangeOrder {
  id: UUID
  owner: UUID
  projectID: UUID
  title: string
  amount: number
  status: ChangeOrderStatus
  notes: string
  categoryName: string
  budgetLineItemID: UUID | null
  budgetLineItemTitle: string
  createdAt: ISODateString
  expectedPaymentDate: ISODateString | null
}

export interface PhotoAttachment {
  id: UUID
  owner: UUID
  projectID: UUID
  imageObjectKey: string | null
  createdAt: ISODateString
  roomTag: string
  phaseTag: string
  categoryName: string
  budgetLineItemID: UUID | null
  notes: string
}

export interface ProjectDocument {
  id: UUID
  owner: UUID
  projectID: UUID
  fileName: string
  kind: ProjectDocumentKind
  status: ProjectDocumentStatus
  notes: string
  budgetLineItemID: UUID | null
  budgetLineItemTitle: string
  uploadedAt: ISODateString
  fileObjectKey: string | null
}

export interface ProjectTask {
  id: UUID
  owner: UUID
  projectID: UUID
  title: string
  status: ProjectTaskStatus
  dueDate: ISODateString | null
  vendorID: UUID | null
  budgetLineItemID: UUID | null
  photoIDs: UUID[]
  notes: string
  createdAt: ISODateString
  completedAt: ISODateString | null
}

export interface BidPackage {
  id: UUID
  owner: UUID
  projectID: UUID
  scopeTitle: string
  dueDate: ISODateString | null
  status: BidPackageStatus
  awardedBidID: UUID | null
  createdAt: ISODateString
  notes: string
}

export interface BidLine {
  id: UUID
  title: string
  amount: number
}

export interface Bid {
  id: UUID
  owner: UUID
  projectID: UUID
  packageID: UUID
  vendorID: UUID | null
  vendorName: string
  amount: number
  fileObjectKey: string | null
  fileName: string
  notes: string
  lineItems: BidLine[]
  createdAt: ISODateString
  awardedAt: ISODateString | null
}

export interface AllowanceSelection {
  id: UUID
  owner: UUID
  projectID: UUID
  lineItemID: UUID
  selectionDate: ISODateString
  vendor: string
  amount: number
  notes: string
  photoObjectKey: string | null
}
