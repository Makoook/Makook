import {
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { VerificationCodeType } from '../../generated/prisma/enums.js';

export class VerifyOtpDto {
  @IsEnum(VerificationCodeType)
  type!: VerificationCodeType;

  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'code must be exactly 6 digits',
  })
  code!: string;
}