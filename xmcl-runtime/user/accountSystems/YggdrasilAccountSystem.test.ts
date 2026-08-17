import { describe, expect, it } from 'vitest'
import { isTwoFactorError } from './YggdrasilAccountSystem'

describe('isTwoFactorError', () => {
  it('recognises the response Ely.by sends for a protected account', () => {
    expect(isTwoFactorError({
      error: 'ForbiddenOperationException',
      errorMessage: 'Account protected with two factor auth.',
    })).toBe(true)
  })

  it('recognises other wordings for the same condition', () => {
    for (const errorMessage of [
      'Invalid credentials. Invalid username, password or 2FA code.',
      'Two-Factor authentication is required',
      'A one-time code is required for this account',
      'Invalid TOTP token',
    ]) {
      expect(isTwoFactorError({ error: 'ForbiddenOperationException', errorMessage }), errorMessage).toBe(true)
    }
  })

  it('leaves a plain bad password alone', () => {
    expect(isTwoFactorError({
      error: 'ForbiddenOperationException',
      errorMessage: 'Invalid credentials. Invalid username or password.',
    })).toBe(false)
  })

  it('ignores errors that are not a forbidden operation', () => {
    expect(isTwoFactorError({
      error: 'IllegalArgumentException',
      errorMessage: 'Account protected with two factor auth.',
    })).toBe(false)
    expect(isTwoFactorError(new Error('two factor'))).toBe(false)
    expect(isTwoFactorError(undefined)).toBe(false)
  })

  it('falls back to the generic message when there is no errorMessage', () => {
    expect(isTwoFactorError({
      error: 'ForbiddenOperationException',
      message: 'Account protected with two factor auth.',
    })).toBe(true)
  })
})
