import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  normalizeEmail,
  normalizePhone,
} from '../identifier-normalizer.js';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? normalizePhone(value)
      : value,
  )
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message:
      'phone must be a valid international phone number',
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? normalizeEmail(value)
      : value,
  )
  email?: string;
}
