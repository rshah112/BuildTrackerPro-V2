import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { LoginScreen } from './LoginScreen'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
  },
}))

vi.mock('./useSession', () => ({
  useSession: () => ({ session: null }),
}))

describe('LoginScreen', () => {
  it('renders email, password, and a submit button', () => {
    const html = renderToString(<LoginScreen />)
    expect(html).toContain('Email')
    expect(html).toContain('Password')
    expect(html).toContain('Sign in')
  })
})
