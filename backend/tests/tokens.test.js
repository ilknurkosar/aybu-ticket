import { describe, expect, it } from 'vitest';
import tokenUtils from '../src/utils/tokens.js';

const { signAccessToken, verifyAccessToken, hashToken } = tokenUtils;

describe('token utilities', () => {
  it('signs and verifies access tokens', () => {
    const token = signAccessToken({ id: 'user-1', email: 'student@aybu.edu.tr', role: 'student', full_name: 'Student' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.email).toBe('student@aybu.edu.tr');
  });

  it('hashes refresh tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
  });
});
