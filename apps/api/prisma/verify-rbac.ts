import 'dotenv/config';
import dotenv from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

dotenv.config({ path: '../../.env' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({ adapter });

try {
  const permissions = await prisma.permission.findMany({
    orderBy: {
      key: 'asc',
    },
  });

  const roles = await prisma.role.findMany({
    orderBy: {
      name: 'asc',
    },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  const assignments = await prisma.rolePermission.count();

  console.log('===== RBAC PERMISSIONS =====');

  for (const permission of permissions) {
    console.log(
      permission.key,
      '|',
      permission.description,
    );
  }

  console.log('');
  console.log('===== RBAC ROLES =====');

  for (const role of roles) {
    console.log('ROLE:', role.name);
    console.log(
      'DESCRIPTION:',
      role.description,
    );
    console.log(
      'PERMISSIONS:',
      role.permissions
        .map((item) => item.permission.key)
        .sort()
        .join(', ') || '(none)',
    );
    console.log('---');
  }

  console.log('');
  console.log('===== RBAC COUNTS =====');
  console.log('ROLES:', roles.length);
  console.log('PERMISSIONS:', permissions.length);
  console.log(
    'ROLE-PERMISSION ASSIGNMENTS:',
    assignments,
  );

  console.log('');
  console.log('===== EXPECTED =====');
  console.log('Expected roles: 2');
  console.log('Expected permissions: 12');
  console.log('Expected ADMIN permissions: 12');
  console.log('Expected USER permissions: 0');

  console.log('');
  console.log('===== RBAC VERIFICATION COMPLETE =====');
} finally {
  await prisma.$disconnect();
}
