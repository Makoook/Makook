import { VerificationCodeType } from '../generated/prisma/enums.js';
import {
  isEmail,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizePhone(phone: string): string {
  // Phone input policy: callers must provide an E.164 number already.
  // Trimming surrounding whitespace is the only safe formatting change.
  return phone.trim();
}

export function normalizeIdentifier(
  type: VerificationCodeType,
  identifier: string,
): string {
  if (type === VerificationCodeType.EMAIL) {
    return normalizeEmail(identifier);
  }

  return normalizePhone(identifier);
}

export function isValidIdentifier(
  type: VerificationCodeType,
  identifier: string,
): boolean {
  const normalizedIdentifier = normalizeIdentifier(type, identifier);

  if (type === VerificationCodeType.EMAIL) {
    return isEmail(normalizedIdentifier);
  }

  return /^\+[1-9]\d{7,14}$/.test(normalizedIdentifier);
}

export function IsValidIdentifier(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isValidIdentifier',
      target: object.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const type = (args.object as { type?: VerificationCodeType }).type;

          return (
            typeof value === 'string' &&
            (type === VerificationCodeType.EMAIL ||
              type === VerificationCodeType.PHONE) &&
            isValidIdentifier(type, value)
          );
        },
      },
    });
  };
}
