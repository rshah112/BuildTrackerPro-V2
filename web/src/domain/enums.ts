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
