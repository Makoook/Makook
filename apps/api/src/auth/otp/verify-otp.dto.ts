import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { VerificationCodeType } from '../../generated/prisma/enums.js';
import {
  IsValidIdentifier,
  normalizeIdentifier,
} from '../../identity/identifier-normalizer.js';

export class VerifyOtpDto {
  @IsEnum(VerificationCodeType)
  type!: VerificationCodeType;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value, obj }) =>
    typeof value === 'string' && obj.type
      ? normalizeIdentifier(obj.type, value)
      : value,
  )
  @IsValidIdentifier({
    message: 'identifier must be a valid email or international phone number',
  })
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'code must be exactly 6 digits',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  deviceId?: string;
}
