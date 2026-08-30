import { describe, expect, it } from 'vitest';
import { VerificationCodeType } from '../generated/prisma/enums.js';
import {
  isValidIdentifier,
  normalizeIdentifier,
} from './identifier-normalizer.js';

describe('identifier normalization policy', () => {
  it('normalizes and validates email identifiers consistently', () => {
    const normalized = normalizeIdentifier(
      VerificationCodeType.EMAIL,
      '  PERSON@EXAMPLE.COM  ',
    );

    expect(normalized).toBe('person@example.com');
    expect(isValidIdentifier(VerificationCodeType.EMAIL, normalized)).toBe(true);
  });

  it('accepts only already-canonical E.164 phone identifiers', () => {
    expect(
      normalizeIdentifier(
        VerificationCodeType.PHONE,
        '  +201000000000  ',
      ),
    ).toBe('+201000000000');
    expect(
      isValidIdentifier(
        VerificationCodeType.PHONE,
        '+201000000000',
      ),
    ).toBe(true);
    expect(
      isValidIdentifier(
        VerificationCodeType.PHONE,
        '01000000000',
      ),
    ).toBe(false);
  });
});
