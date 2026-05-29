import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoginScreen } from './LoginScreen'

describe('LoginScreen', () => {
  it('renders email, password, and a submit button', () => {
    render(<LoginScreen />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
