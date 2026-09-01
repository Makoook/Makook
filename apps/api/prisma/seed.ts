import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const permissions = [
  {
    key: 'identity:user:create',
    description: 'Create user records',
  },
  {
    key: 'identity:user:read',
    description: 'Read user records',
  },
  {
    key: 'identity:user:update',
    description: 'Update user records',
  },
  {
    key: 'identity:user:delete',
    description: 'Delete user records',
  },

  {
    key: 'authorization:role:read',
    description: 'Read roles',
  },
  {
    key: 'authorization:role:create',
    description: 'Create roles',
  },
  {
    key: 'authorization:role:update',
    description: 'Update roles',
  },
  {
    key: 'authorization:role:delete',
    description: 'Delete roles',
  },

  {
    key: 'authorization:permission:read',
    description: 'Read permissions',
  },
  {
    key: 'authorization:permission:assign',
    description: 'Assign permissions to roles',
  },
  {
    key: 'authorization:permission:remove',
    description: 'Remove permissions from roles',
  },

  {
    key: 'authorization:user-role:assign',
    description: 'Assign roles to users',
  },
  {
    key: 'authorization:user-role:remove',
    description: 'Remove roles from users',
  },
];

const roles = [
  {
    name: 'USER',
    description: 'Standard application user',
  },
  {
    name: 'ADMIN',
    description: 'Application administrator',
  },
];

async function main() {
  const permissionRecords = new Map<
    string,
    { id: string; key: string }
  >();

  for (const permission of permissions) {
    const record = await prisma.permission.upsert({
      where: {
        key: permission.key,
      },
      update: {
        description: permission.description,
      },
      create: permission,
    });

    permissionRecords.set(
      permission.key,
      record,
    );
  }

  const roleRecords = new Map<
    string,
    { id: string; name: string }
  >();

  for (const role of roles) {
    const record = await prisma.role.upsert({
      where: {
        name: role.name,
      },
      update: {
        description: role.description,
      },
      create: role,
    });

    roleRecords.set(
      role.name,
      record,
    );
  }

  const adminRole = roleRecords.get('ADMIN');

  if (!adminRole) {
    throw new Error('ADMIN role was not created');
  }

  for (const permission of permissions) {
    const permissionRecord =
      permissionRecords.get(permission.key);

    if (!permissionRecord) {
      throw new Error(
        `Permission was not created: ${permission.key}`,
      );
    }

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permissionRecord.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permissionRecord.id,
      },
    });
  }

  console.log(
    'RBAC seed completed successfully.',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
