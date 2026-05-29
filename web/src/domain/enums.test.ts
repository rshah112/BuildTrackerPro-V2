import { describe, it, expect } from 'vitest'
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  PROJECT_TEMPLATE_TYPES,
  CHANGE_ORDER_STATUSES,
  BID_PACKAGE_STATUSES,
  PROJECT_DOCUMENT_KINDS,
  PROJECT_DOCUMENT_STATUSES,
  PROJECT_TASK_STATUSES,
} from './enums'

describe('enums mirror native raw values', () => {
  it('project status', () => {
    expect([...PROJECT_STATUSES]).toEqual(['planning', 'active', 'paused', 'complete'])
  })
  it('project priority', () => {
    expect([...PROJECT_PRIORITIES]).toEqual(['low', 'normal', 'high', 'urgent'])
  })
  it('template types: 11 members incl. custom', () => {
    expect(PROJECT_TEMPLATE_TYPES).toHaveLength(11)
    expect(PROJECT_TEMPLATE_TYPES).toContain('customHome')
    expect(PROJECT_TEMPLATE_TYPES).toContain('custom')
  })
  it('change order status', () => {
    expect([...CHANGE_ORDER_STATUSES]).toEqual(['pending', 'approved', 'paid'])
  })
  it('bid package status', () => {
    expect([...BID_PACKAGE_STATUSES]).toEqual(['open', 'awarded', 'passed'])
  })
  it('document kinds incl. contractsInsurance', () => {
    expect(PROJECT_DOCUMENT_KINDS).toContain('contractsInsurance')
    expect(PROJECT_DOCUMENT_KINDS).toHaveLength(7)
  })
  it('document status', () => {
    expect([...PROJECT_DOCUMENT_STATUSES]).toEqual(['required', 'received', 'missing'])
  })
  it('task status', () => {
    expect([...PROJECT_TASK_STATUSES]).toEqual(['todo', 'inProgress', 'blocked', 'done'])
  })
})
