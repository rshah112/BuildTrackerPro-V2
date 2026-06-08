// Domain types mirroring ParamusBuild/Models/*.swift.
// Conventions: UUIDs and dates are strings (ISO-8601 for dates); money is a number
// of dollars (see lib/money.ts); the native `.externalStorage` Data? blob fields
// become `*ObjectKey` columns holding the R2 object key (or null). Field names are
// camelCase with `Id`/`Ids` suffixes (not `ID`) so the snake_case mapper produces
// clean column names (budgetLineItemId -> budget_line_item_id).

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
  projectId: UUID
  name: string
  sortOrder: number
  targetBudget: number
  systemImage: string
}

export interface BudgetLineItem {
  id: UUID
  owner: UUID
  projectId: UUID
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
  projectId: UUID
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
  budgetLineItemId: UUID | null
  budgetLineItemTitle: string
  notes: string
  isPaid: boolean
  receiptObjectKey: string | null
  /** '' (unset/personal), 'personal', or 'loan' — see FUNDING_SOURCES. */
  fundingSource?: string
}

export interface Vendor {
  id: UUID
  owner: UUID
  projectId: UUID
  name: string
  trade: string
  phone: string
  email: string
  notes: string
  /** W-9 tax id (EIN/SSN) for 1099 prep. */
  taxId: string
  licenseNumber: string
  /** Certificate-of-insurance expiry date (null = not tracked). */
  insuranceExpiry: ISODateString | null
}

export interface ChangeOrder {
  id: UUID
  owner: UUID
  projectId: UUID
  title: string
  amount: number
  status: ChangeOrderStatus
  notes: string
  categoryName: string
  budgetLineItemId: UUID | null
  budgetLineItemTitle: string
  createdAt: ISODateString
  expectedPaymentDate: ISODateString | null
}

export interface PhotoAttachment {
  id: UUID
  owner: UUID
  projectId: UUID
  imageObjectKey: string | null
  createdAt: ISODateString
  roomTag: string
  phaseTag: string
  categoryName: string
  budgetLineItemId: UUID | null
  notes: string
}

export interface ProjectDocument {
  id: UUID
  owner: UUID
  projectId: UUID
  fileName: string
  kind: ProjectDocumentKind
  status: ProjectDocumentStatus
  notes: string
  budgetLineItemId: UUID | null
  budgetLineItemTitle: string
  uploadedAt: ISODateString
  fileObjectKey: string | null
}

export interface ProjectTask {
  id: UUID
  owner: UUID
  projectId: UUID
  title: string
  status: ProjectTaskStatus
  dueDate: ISODateString | null
  vendorId: UUID | null
  budgetLineItemId: UUID | null
  photoIds: UUID[]
  notes: string
  createdAt: ISODateString
  completedAt: ISODateString | null
}

export interface BidPackage {
  id: UUID
  owner: UUID
  projectId: UUID
  scopeTitle: string
  dueDate: ISODateString | null
  status: BidPackageStatus
  awardedBidId: UUID | null
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
  projectId: UUID
  packageId: UUID
  vendorId: UUID | null
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
  projectId: UUID
  lineItemId: UUID
  selectionDate: ISODateString
  vendor: string
  amount: number
  notes: string
  photoObjectKey: string | null
}

export interface ConstructionLoan {
  id: UUID
  owner: UUID
  projectId: UUID
  lender: string
  totalAmount: number
  /** Annual interest rate as a percent (interest-only). */
  interestRate: number
  notes: string
  createdAt: ISODateString
  deletedAt?: ISODateString | null
}

export interface LoanDraw {
  id: UUID
  owner: UUID
  projectId: UUID
  loanId: UUID
  amount: number
  drawDate: ISODateString
  description: string
  notes: string
  createdAt: ISODateString
  deletedAt?: ISODateString | null
}

export interface Phase {
  id: UUID
  owner: UUID
  projectId: UUID
  name: string
  /** Completion 0–100. */
  pctComplete: number
  sortOrder: number
  targetDate: ISODateString | null
  notes: string
  createdAt: ISODateString
  deletedAt?: ISODateString | null
}

export interface NotificationPrefs {
  owner: UUID
  /** Days before an item's expected/due date to start the "due soon" reminder. */
  leadDays: number
  /** Quiet-hours window (local hours 0–23); reminders are suppressed inside it. */
  quietStart: number
  quietEnd: number
  remindDueSoon: boolean
  remindOverdue: boolean
  remindChangeOrders: boolean
  updatedAt: ISODateString
}
