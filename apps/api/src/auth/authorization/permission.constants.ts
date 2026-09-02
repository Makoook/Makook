export const PERMISSIONS = {
  IDENTITY_USER_CREATE: 'identity:user:create',
  IDENTITY_USER_READ: 'identity:user:read',
  IDENTITY_USER_UPDATE: 'identity:user:update',
  IDENTITY_USER_DELETE: 'identity:user:delete',

  AUTHORIZATION_ROLE_READ: 'authorization:role:read',
  AUTHORIZATION_ROLE_CREATE: 'authorization:role:create',
  AUTHORIZATION_ROLE_UPDATE: 'authorization:role:update',
  MISSION_READ_AVAILABLE: 'mission:read:available',
  MISSION_ACCEPT: 'mission:accept',
  MISSION_START: 'mission:start',
  MISSION_COMPLETE: 'mission:complete',
  MISSION_READ_ANY: 'mission:read:any',
  MISSION_REASSIGN: 'mission:reassign',
  PAYMENT_READ_ANY: 'payment:read:any',
  PAYMENT_MANAGE_ANY: 'payment:manage:any',

  AUTHORIZATION_ROLE_DELETE: 'authorization:role:delete',

  AUTHORIZATION_PERMISSION_READ: 'authorization:permission:read',
  AUTHORIZATION_PERMISSION_ASSIGN: 'authorization:permission:assign',
  AUTHORIZATION_PERMISSION_REMOVE: 'authorization:permission:remove',

  AUTHORIZATION_USER_ROLE_ASSIGN: 'authorization:user-role:assign',
  AUTHORIZATION_USER_ROLE_REMOVE: 'authorization:user-role:remove',
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
