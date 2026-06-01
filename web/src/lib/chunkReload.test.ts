import { describe, it, expect } from 'vitest'
import { isChunkError } from './chunkReload'

describe('isChunkError', () => {
  it('matches the common lazy-chunk load failures', () => {
    expect(isChunkError(new Error('Failed to fetch dynamically imported module: /assets/ExpensesScreen-abc.js'))).toBe(true)
    expect(isChunkError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkError({ name: 'ChunkLoadError', message: 'Loading chunk 5 failed' })).toBe(true)
  })

  it('ignores unrelated runtime errors', () => {
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkError(null)).toBe(false)
    expect(isChunkError(undefined)).toBe(false)
  })
})
