import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getStoredTheme, resolveTheme, setTheme } from './theme'

// The project runs tests under the `node` env (no jsdom), so stub the two browser
// globals theme.ts touches. resolveTheme is pure and needs neither.
function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  }
}
function fakeDocument() {
  const attrs = new Map<string, string>()
  return {
    documentElement: {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      getAttribute: (k: string) => (attrs.has(k) ? attrs.get(k)! : null),
      removeAttribute: (k: string) => void attrs.delete(k),
    },
  }
}

describe('resolveTheme', () => {
  it('follows the system preference when pref is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('forces the chosen theme regardless of system', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('theme storage + application', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
    vi.stubGlobal('document', fakeDocument())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to system when nothing is stored or value is junk', () => {
    expect(getStoredTheme()).toBe('system')
    localStorage.setItem('btp.theme', 'nonsense')
    expect(getStoredTheme()).toBe('system')
  })

  it('persists the preference and reflects it back', () => {
    setTheme('dark')
    expect(getStoredTheme()).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('applyTheme writes a resolved light|dark attribute', () => {
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
