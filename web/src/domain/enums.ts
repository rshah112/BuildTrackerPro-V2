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

// WHOSE cash left the building first — the dimension `payment_method` (the rail: Zelle, check,
// card) can't express. This is deliberately NOT "was it loan money", because that question has no
// stable answer: a soft cost fronted personally and later repaid from draw #1 was both, in
// sequence. Origin is fixed at payment time; whether the fronting party has since been made whole
// is a SETTLEMENT question, answered by disbursement allocations, not by a field.
//
// Only 'owner_personal' and 'builder' create an obligation — someone is owed. 'owner_draw' and
// 'loan_direct' are already loan-funded, so nothing is owed; they only consume draw cash.
//
// Legacy values 'personal' and 'loan' remain readable and map to owner_personal / owner_draw via
// normalizeFundingSource, so existing rows need no data migration.
export const FUNDING_SOURCES = ['owner_personal', 'builder', 'owner_draw', 'loan_direct'] as const
export type FundingSource = (typeof FUNDING_SOURCES)[number]

export const FUNDING_SOURCE_LABEL: Record<FundingSource, string> = {
  owner_personal: 'You (personal funds)',
  builder: 'Builder fronted it',
  owner_draw: 'You, from draw cash',
  loan_direct: 'Lender paid directly',
}

/** Parties that can front cash and therefore be owed a reimbursement. */
export const FRONTING_SOURCES = ['owner_personal', 'builder'] as const satisfies readonly FundingSource[]

/** Map stored values — including the pre-0020 'personal'/'loan' and '' — onto the current union. */
export function normalizeFundingSource(raw: string | null | undefined): FundingSource {
  switch (raw) {
    case 'builder':
    case 'owner_draw':
    case 'loan_direct':
    case 'owner_personal':
      return raw
    case 'loan':
      return 'owner_draw'
    // '' (unset), 'personal', and anything unrecognised are treated as personal funds, matching
    // the pre-existing behaviour of the funding-split panel.
    default:
      return 'owner_personal'
  }
}

/** True when this origin means someone fronted cash and is owed it back. */
export function createsObligation(raw: string | null | undefined): boolean {
  const source = normalizeFundingSource(raw)
  return source === 'owner_personal' || source === 'builder'
}

// Draw lifecycle. Only a FUNDED draw has moved money, so only funded draws count toward the loan
// balance, interest, facility utilization, or available cash.
export const DRAW_STATUSES = ['requested', 'approved', 'funded'] as const
export type DrawStatus = (typeof DRAW_STATUSES)[number]
export const DRAW_STATUS_LABEL: Record<DrawStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  funded: 'Funded',
}

export const DRAW_INSPECTION_STATUSES = ['', 'not_required', 'scheduled', 'passed', 'failed'] as const
export type DrawInspectionStatus = (typeof DRAW_INSPECTION_STATUSES)[number]
export const DRAW_INSPECTION_STATUS_LABEL: Record<DrawInspectionStatus, string> = {
  '': 'Not tracked',
  not_required: 'Not required',
  scheduled: 'Scheduled',
  passed: 'Passed',
  failed: 'Failed',
}

// Who RECEIVED draw cash: yourself (repaying what you fronted), the builder (making him whole),
// or a sub paid directly out of the draw.
export const DISBURSEMENT_PARTY_TYPES = ['self', 'builder', 'vendor'] as const
export type DisbursementPartyType = (typeof DISBURSEMENT_PARTY_TYPES)[number]
export const DISBURSEMENT_PARTY_LABEL: Record<DisbursementPartyType, string> = {
  self: 'Reimburse yourself',
  builder: 'Reimburse the builder',
  vendor: 'Pay a sub directly',
}

// Day-count convention. Worth roughly 1.4% on the interest figure, so it's user-selectable.
export const INTEREST_BASES = ['actual/365', '30/360'] as const
export type InterestBasis = (typeof INTEREST_BASES)[number]
export const INTEREST_BASIS_LABEL: Record<InterestBasis, string> = {
  'actual/365': 'Actual / 365',
  '30/360': '30 / 360',
}

// Suggestions for the expense form's payment-method picker (a Combobox that also accepts a
// custom value). NOT a DB check-constraint — payment_method is free text — so this is purely
// a convenience list; the last-used value is remembered via lib/lastUsed.
export const PAYMENT_METHODS = ['Check', 'ACH / bank transfer', 'Credit card', 'Cash', 'Wire', 'Zelle'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
