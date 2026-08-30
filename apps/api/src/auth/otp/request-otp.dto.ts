import {
  IsEnum,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { VerificationCodeType } from '../../generated/prisma/enums.js';

export class RequestOtpDto {
  @IsEnum(VerificationCodeType)
  type!: VerificationCodeType;

  @IsString()
  @IsNotEmpty()
  identifier!: string;
}