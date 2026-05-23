import { describe, expect, it } from 'vitest';
import authService from '../src/services/authService.js';

const { assertAybuEmail } = authService;

describe('AYBU email registration policy', () => {
  it('accepts AYBU email addresses', () => {
    expect(() => assertAybuEmail('student@aybu.edu.tr')).not.toThrow();
  });

  it('rejects non-AYBU email addresses', () => {
    expect(() => assertAybuEmail('student@example.com')).toThrow(/Only @aybu.edu.tr/);
  });
});
