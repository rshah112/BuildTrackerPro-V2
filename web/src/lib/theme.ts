// Theme preference: 'system' follows the OS, 'light'/'dark' force it. We store the
// preference but always apply a *resolved* light|dark to <html data-theme>, so the
// CSS only needs :root[data-theme='dark'] (no media queries).

export type ThemePref = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'btp.theme'

export function resolveTheme(pref: ThemePref, prefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return prefersDark ? 'dark' : 'light'
  return pref
}

export function getStoredTheme(): ThemePref {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

function systemPrefersDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

export function applyTheme(pref: ThemePref): void {
  const resolved = resolveTheme(pref, systemPrefersDark())
  document.documentElement.setAttribute('data-theme', resolved)
}

export function setTheme(pref: ThemePref): void {
  localStorage.setItem(KEY, pref)
  applyTheme(pref)
}

/** Apply the stored preference and keep following the OS while pref === 'system'. */
export function initTheme(): void {
  applyTheme(getStoredTheme())
  if (typeof matchMedia === 'undefined') return
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  })
}
