import { describe, expect, it } from 'vitest'
import { resolveSupabaseConfig } from './supabase'

describe('Supabase configuration', () => {
  it('fails closed when production configuration is missing', () => {
    expect(() => resolveSupabaseConfig({ production: true })).toThrow('Missing production Supabase configuration')
  })

  it('rejects a partially configured environment', () => {
    expect(() => resolveSupabaseConfig({ production: true, url: 'https://example.supabase.co' })).toThrow(
      'must be configured together',
    )
  })

  it('keeps a local fallback for development and tests', () => {
    expect(resolveSupabaseConfig({ production: false })).toEqual({
      url: 'http://127.0.0.1:54321',
      anonKey: 'local-anon-key',
    })
  })

  it('uses explicitly supplied deployment values', () => {
    expect(
      resolveSupabaseConfig({ production: true, url: ' https://example.supabase.co ', anonKey: ' public-key ' }),
    ).toEqual({ url: 'https://example.supabase.co', anonKey: 'public-key' })
  })
})
