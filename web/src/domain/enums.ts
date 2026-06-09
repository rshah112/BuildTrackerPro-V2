// Enum raw values mirrored exactly from the native Swift models so data is portable
// and DB check-constraints line up. Each is an `as const` tuple: use the array at
// runtime (dropdowns, validation) and the derived union as the type.

export const PROJECT_STATUSES = ['planning', 'active', 'paused', 'complete'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number]

export const PROJECT_TEMPLATE_TYPES = [
  'customHome',
  'majorRenovation',
  'addition',
  'poolBackyard',
  'deckPatio',
  'kitchenRemodel',
  'bathroomRemodel',
  'basementFinish',
  'garageBuild',
  'landscapingHardscape',
  'custom',
] as const
export type ProjectTemplateType = (typeof PROJECT_TEMPLATE_TYPES)[number]

export const CHANGE_ORDER_STATUSES = ['pending', 'approved', 'paid'] as const
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number]

export const BID_PACKAGE_STATUSES = ['open', 'awarded', 'passed'] as const
export type BidPackageStatus = (typeof BID_PACKAGE_STATUSES)[number]

export const PROJECT_DOCUMENT_KINDS = [
  'survey',
  'approvals',
  'plans',
  'inspections',
  'contractsInsurance',
  'receiptsWarranties',
  'other',
] as const
export type ProjectDocumentKind = (typeof PROJECT_DOCUMENT_KINDS)[number]

export const PROJECT_DOCUMENT_STATUSES = ['required', 'received', 'missing'] as const
export type ProjectDocumentStatus = (typeof PROJECT_DOCUMENT_STATUSES)[number]

export const PROJECT_TASK_STATUSES = ['todo', 'inProgress', 'blocked', 'done'] as const
export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUSES)[number]

// The four standard construction lien-waiver types: conditional vs unconditional × progress vs final.
export const LIEN_WAIVER_TYPES = [
  'conditional_progress',
  'unconditional_progress',
  'conditional_final',
  'unconditional_final',
] as const
export type LienWaiverType = (typeof LIEN_WAIVER_TYPES)[number]
export const LIEN_WAIVER_TYPE_LABEL: Record<LienWaiverType, string> = {
  conditional_progress: 'Conditional · Progress',
  unconditional_progress: 'Unconditional · Progress',
  conditional_final: 'Conditional · Final',
  unconditional_final: 'Unconditional · Final',
}

// How an expense was funded — personal funds (cash/CC) vs the construction loan. '' = unset
// (treated as personal). Only surfaced in the UI when the project has a construction loan.
export const FUNDING_SOURCES = ['personal', 'loan'] as const
export type FundingSource = (typeof FUNDING_SOURCES)[number]

// Suggestions for the expense form's payment-method picker (a Combobox that also accepts a
// custom value). NOT a DB check-constraint — payment_method is free text — so this is purely
// a convenience list; the last-used value is remembered via lib/lastUsed.
export const PAYMENT_METHODS = ['Check', 'ACH / bank transfer', 'Credit card', 'Cash', 'Wire', 'Zelle'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
