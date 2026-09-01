import { SetMetadata } from '@nestjs/common';
import { Permission } from './permission.constants.js';

export const REQUIRED_PERMISSION_KEY =
  'required_permission';

export const RequirePermission = (
  permission: Permission,
) =>
  SetMetadata(
    REQUIRED_PERMISSION_KEY,
    permission,
  );
