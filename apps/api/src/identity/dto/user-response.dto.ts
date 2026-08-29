import { UserStatus } from '../../generated/prisma/enums.js';

export class UserResponseDto {
  id!: string;
  phone!: string | null;
  email!: string | null;
  phoneVerifiedAt!: Date | null;
  emailVerifiedAt!: Date | null;
  status!: UserStatus;
  createdAt!: Date;
  updatedAt!: Date;
  deletedAt!: Date | null;
  roles!: {
    id: string;
    name: string;
    description: string | null;
  }[];
}
