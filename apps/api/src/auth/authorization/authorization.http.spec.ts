import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';

import { AuthorizationModule } from './authorization.module.js';
import { AuthModule } from '../auth.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('AuthorizationController - HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let adminId: string;
  let userId: string;

  let adminRoleId: string;
  let userRoleId: string;

  let adminSessionId: string;
  let userSessionId: string;

  let testRoleId: string;
  let permissionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, AuthorizationModule],
    }).compile();

    app = moduleRef.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const timestamp = Date.now();

    const admin = await prisma.user.create({
      data: {
        email: `authorization-http-admin-${timestamp}@makook.local`,
      },
    });

    const user = await prisma.user.create({
      data: {
        email: `authorization-http-user-${timestamp}@makook.local`,
      },
    });

    adminId = admin.id;
    userId = user.id;

    const adminRole = await prisma.role.findUnique({
      where: { name: 'ADMIN' },
    });

    const userRole = await prisma.role.findUnique({
      where: { name: 'USER' },
    });

    if (!adminRole || !userRole) {
      throw new Error('Required RBAC roles were not found');
    }

    adminRoleId = adminRole.id;
    userRoleId = userRole.id;

    await prisma.userRole.create({
      data: {
        userId: adminId,
        roleId: adminRoleId,
      },
    });

    const permission = await prisma.permission.findUnique({
      where: {
        key: 'authorization:role:read',
      },
    });

    if (!permission) {
      throw new Error(
        'authorization:role:read permission was not found',
      );
    }

    permissionId = permission.id;

    const adminSession = await prisma.session.create({
      data: {
        userId: adminId,
        familyId: `authorization-http-admin-family-${timestamp}`,
        refreshTokenHash: `authorization-http-admin-refresh-${timestamp}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const userSession = await prisma.session.create({
      data: {
        userId,
        familyId: `authorization-http-user-family-${timestamp}`,
        refreshTokenHash: `authorization-http-user-refresh-${timestamp}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    adminSessionId = adminSession.id;
    userSessionId = userSession.id;
  });

  afterAll(async () => {
    if (testRoleId) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: testRoleId },
      });

      await prisma.userRole.deleteMany({
        where: { roleId: testRoleId },
      });

      await prisma.role.delete({
        where: { id: testRoleId },
      }).catch(() => undefined);
    }

    await prisma.userRole.deleteMany({
      where: {
        userId: {
          in: [adminId, userId],
        },
      },
    });

    await prisma.session.deleteMany({
      where: {
        id: {
          in: [adminSessionId, userSessionId],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [adminId, userId],
        },
      },
    });

    await app?.close();
  });

  async function accessTokenFor(
    userId: string,
  ): Promise<string> {
    const sessionId =
      userId === adminId
        ? adminSessionId
        : userSessionId;

    return jwtService.signAsync({
      sub: userId,
      sid: sessionId,
    });
  }

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get('/authorization/roles')
      .expect(401);
  });

  it('rejects a USER from reading roles', async () => {
    const token = await accessTokenFor(userId);

    const response = await request(app.getHttpServer())
      .get('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.message).toBe(
      'Insufficient permissions',
    );
  });

  it('allows an ADMIN to read roles', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .get('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('allows an ADMIN to read permissions', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .get('/authorization/permissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);

    expect(
      response.body.some(
        (permission: { key: string }) =>
          permission.key === 'authorization:role:read',
      ),
    ).toBe(true);
  });

  it('allows an ADMIN to create a role', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .post('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `HTTP_TEST_ROLE_${Date.now()}`,
        description: 'Authorization HTTP test role',
      })
      .expect(201);

    expect(response.body.id).toBeDefined();

    testRoleId = response.body.id;
  });

  it('allows an ADMIN to update the test role', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .patch(`/authorization/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Updated authorization HTTP test role',
      })
      .expect(200);

    expect(response.body.description).toBe(
      'Updated authorization HTTP test role',
    );
  });

  it('allows an ADMIN to read the test role', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .get(`/authorization/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(testRoleId);
  });

  it('allows an ADMIN to assign a permission to the test role', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .post(
        `/authorization/roles/${testRoleId}/permissions/${permissionId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const assignment = await prisma.rolePermission.findFirst({
      where: {
        roleId: testRoleId,
        permissionId,
      },
    });

    expect(assignment).not.toBeNull();
  });

  it('allows an ADMIN to remove a permission from the test role', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .delete(
        `/authorization/roles/${testRoleId}/permissions/${permissionId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const assignment = await prisma.rolePermission.findFirst({
      where: {
        roleId: testRoleId,
        permissionId,
      },
    });

    expect(assignment).toBeNull();
  });

  it('allows an ADMIN to assign and remove a role from a user', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .post(
        `/authorization/users/${userId}/roles/${testRoleId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    let assignment = await prisma.userRole.findFirst({
      where: {
        userId,
        roleId: testRoleId,
      },
    });

    expect(assignment).not.toBeNull();

    await request(app.getHttpServer())
      .delete(
        `/authorization/users/${userId}/roles/${testRoleId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    assignment = await prisma.userRole.findFirst({
      where: {
        userId,
        roleId: testRoleId,
      },
    });

    expect(assignment).toBeNull();
  });

  it('allows an ADMIN to read a user roles', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .get(`/authorization/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('allows an ADMIN to delete the test role', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .delete(`/authorization/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const deleted = await prisma.role.findUnique({
      where: { id: testRoleId },
    });

    expect(deleted).toBeNull();

    testRoleId = '';
  });

  it('allows ADMIN to read roles', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .get('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows ADMIN to read permissions', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .get('/authorization/permissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows ADMIN to read a role by id', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .get(`/authorization/roles/${adminRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows ADMIN to create a role', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .post('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `HTTP_TEST_ROLE_${Date.now()}`,
        description: 'HTTP authorization test role',
      })
      .expect(201);

    testRoleId = response.body.id;
  });

  it('allows ADMIN to read user roles', async () => {
    const token = await accessTokenFor(adminId);

    await request(app.getHttpServer())
      .get(`/authorization/users/${adminId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows ADMIN to assign a role to a user', async () => {
    const token = await accessTokenFor(adminId);

    if (!testRoleId) {
      const response = await request(app.getHttpServer())
        .post('/authorization/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `HTTP_TEST_ROLE_${Date.now()}`,
          description: 'HTTP authorization test role',
        })
        .expect(201);

      testRoleId = response.body.id;
    }

    await request(app.getHttpServer())
      .post(`/authorization/users/${userId}/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  it('allows ADMIN to remove a role from a user', async () => {
    const token = await accessTokenFor(adminId);

    if (!testRoleId) {
      const response = await request(app.getHttpServer())
        .post('/authorization/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `HTTP_TEST_ROLE_${Date.now()}`,
          description: 'HTTP authorization test role',
        })
        .expect(201);

      testRoleId = response.body.id;
    }

    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: testRoleId,
        },
      },
      update: {},
      create: {
        userId,
        roleId: testRoleId,
      },
    });

    await request(app.getHttpServer())
      .delete(`/authorization/users/${userId}/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows ADMIN to assign a permission to a role', async () => {
    const token = await accessTokenFor(adminId);

    if (!testRoleId) {
      const response = await request(app.getHttpServer())
        .post('/authorization/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `HTTP_TEST_ROLE_${Date.now()}`,
          description: 'HTTP authorization test role',
        })
        .expect(201);

      testRoleId = response.body.id;
    }

    await request(app.getHttpServer())
      .post(
        `/authorization/roles/${testRoleId}/permissions/${permissionId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
  });

  it('allows ADMIN to remove a permission from a role', async () => {
    const token = await accessTokenFor(adminId);

    if (!testRoleId) {
      const response = await request(app.getHttpServer())
        .post('/authorization/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `HTTP_TEST_ROLE_${Date.now()}`,
          description: 'HTTP authorization test role',
        })
        .expect(201);

      testRoleId = response.body.id;
    }

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: testRoleId,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId: testRoleId,
        permissionId,
      },
    });

    await request(app.getHttpServer())
      .delete(
        `/authorization/roles/${testRoleId}/permissions/${permissionId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('allows ADMIN to update a role', async () => {
    const token = await accessTokenFor(adminId);

    if (!testRoleId) {
      const response = await request(app.getHttpServer())
        .post('/authorization/roles')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `HTTP_TEST_ROLE_${Date.now()}`,
          description: 'HTTP authorization test role',
        })
        .expect(201);

      testRoleId = response.body.id;
    }

    await request(app.getHttpServer())
      .patch(`/authorization/roles/${testRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'Updated HTTP authorization test role',
      })
      .expect(200);
  });

  it('allows ADMIN to delete a role', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .post('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `HTTP_DELETE_TEST_ROLE_${Date.now()}`,
        description: 'Role that will be deleted',
      })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/authorization/roles/${response.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('rejects USER from reading permissions', async () => {
    const token = await accessTokenFor(userId);

    await request(app.getHttpServer())
      .get('/authorization/permissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects USER from creating roles', async () => {
    const token = await accessTokenFor(userId);

    await request(app.getHttpServer())
      .post('/authorization/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `UNAUTHORIZED_ROLE_${Date.now()}`,
        description: 'Should not be created',
      })
      .expect(403);
  });

  it('rejects USER from assigning roles', async () => {
    const token = await accessTokenFor(userId);

    await request(app.getHttpServer())
      .post(`/authorization/users/${userId}/roles/${userRoleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects USER from assigning permissions', async () => {
    const token = await accessTokenFor(userId);

    await request(app.getHttpServer())
      .post(`/authorization/roles/${userRoleId}/permissions/${permissionId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

});
