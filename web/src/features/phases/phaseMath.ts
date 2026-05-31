import type { Phase } from '../../domain/types'

// A standard residential-construction phase sequence, offered as a one-tap starting point
// on an empty project (the user can rename/add/remove afterward). Mirrors the native
// build-phase ordering.
export const STANDARD_PHASES: string[] = [
  'Pre-Construction & Permits',
  'Site Work & Excavation',
  'Foundation',
  'Framing',
  'Roofing & Exterior Dry-In',
  'Rough-In (Plumbing / Electrical / HVAC)',
  'Insulation & Drywall',
  'Interior Finishes',
  'Exterior Finishes & Landscaping',
  'Final Inspections & Punch List',
]

export interface PhaseProgress {
  /** Overall completion 0–100, the simple average of every phase's pctComplete. */
  overall: number
  done: number
  total: number
  /** First phase that's started but not finished, else the first unfinished one. */
  current: Phase | null
}

/** Sort phases by their explicit order, then creation time as a stable tiebreaker. */
export function sortPhases(phases: Phase[]): Phase[] {
  return [...phases].sort(
    (a, b) => a.sortOrder - b.sortOrder || (a.createdAt || '').localeCompare(b.createdAt || ''),
  )
}

export function phaseProgress(phases: Phase[]): PhaseProgress {
  const total = phases.length
  if (total === 0) return { overall: 0, done: 0, total: 0, current: null }
  const sorted = sortPhases(phases)
  const sum = sorted.reduce((acc, p) => acc + clampPct(p.pctComplete), 0)
  const overall = Math.round(sum / total)
  const done = sorted.filter((p) => clampPct(p.pctComplete) >= 100).length
  const current =
    sorted.find((p) => clampPct(p.pctComplete) > 0 && clampPct(p.pctComplete) < 100) ??
    sorted.find((p) => clampPct(p.pctComplete) < 100) ??
    null
  return { overall, done, total, current }
}

export function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}
