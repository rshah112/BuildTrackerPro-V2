// Remember the user's last choice for a few "sticky" form fields (payment method, funding
// source) so repeated expense entry is one fewer tap. Stored in localStorage, scoped by key.
// All access is guarded so it's safe in private mode / when storage is disabled.

const PREFIX = 'btp:lastUsed:'

export function getLastUsed(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function setLastUsed(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(PREFIX + key, value)
  } catch {
    // ignore — private mode or storage disabled
  }
}
