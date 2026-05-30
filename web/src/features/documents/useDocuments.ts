import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { ProjectDocument } from '../../domain/types'
import type { ProjectDocumentKind } from '../../domain/enums'

const TABLE = 'project_documents'

export const useDocuments = (projectId: string) => useRows<ProjectDocument>(TABLE, { projectId })
export const useCreateDocument = () => useCreateRow<ProjectDocument>(TABLE)
export const useUpdateDocument = () => useUpdateRow<ProjectDocument>(TABLE)
export const useRemoveDocument = () => useRemoveRow(TABLE)

/** Display titles mirrored from the native app's ProjectDocumentKind. */
export const DOCUMENT_KIND_LABEL: Record<ProjectDocumentKind, string> = {
  survey: 'Survey',
  approvals: 'Permits & Approvals',
  plans: 'Plans',
  inspections: 'Inspections',
  contractsInsurance: 'Contracts & Insurance',
  receiptsWarranties: 'Receipts & Warranties',
  other: 'Other',
}

/** The documents a real build should have on file — drives the required checklist. */
export const REQUIRED_DOCUMENT_KINDS: ProjectDocumentKind[] = ['survey', 'approvals', 'plans', 'contractsInsurance']
