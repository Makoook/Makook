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
import { IdentityModule } from './identity.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('IdentityController - HTTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let ownerId: string;
  let otherId: string;
  let adminId: string;

  let ownerSessionId: string;
  let adminSessionId: string;

  let adminRoleId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IdentityModule],
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

    const owner = await prisma.user.create({
      data: {
        email: `identity-http-owner-${timestamp}@makook.local`,
      },
    });

    const other = await prisma.user.create({
      data: {
        email: `identity-http-other-${timestamp}@makook.local`,
      },
    });

    const admin = await prisma.user.create({
      data: {
        email: `identity-http-admin-${timestamp}@makook.local`,
      },
    });

    ownerId = owner.id;
    otherId = other.id;
    adminId = admin.id;

    const adminRole = await prisma.role.findUnique({
      where: {
        name: 'ADMIN',
      },
    });

    if (!adminRole) {
      throw new Error('ADMIN role was not found');
    }

    adminRoleId = adminRole.id;

    await prisma.userRole.create({
      data: {
        userId: adminId,
        roleId: adminRoleId,
      },
    });

    const ownerSession = await prisma.session.create({
      data: {
        userId: ownerId,
        familyId: ownerId,
        refreshTokenHash: 'identity-http-owner-test',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const adminSession = await prisma.session.create({
      data: {
        userId: adminId,
        familyId: adminId,
        refreshTokenHash: 'identity-http-admin-test',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    ownerSessionId = ownerSession.id;
    adminSessionId = adminSession.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: {
        id: {
          in: [ownerSessionId, adminSessionId],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [ownerId, otherId, adminId],
        },
      },
    });

    await app.close();
  });

  async function accessTokenFor(
    userId: string,
  ): Promise<string> {
    const sessionId =
      userId === ownerId
        ? ownerSessionId
        : userId === adminId
          ? adminSessionId
          : ownerSessionId;

    return jwtService.signAsync({
      sub: userId,
      sid: sessionId,
    });
  }

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get(`/identity/users/${ownerId}`)
      .expect(401);
  });

  it('allows a USER to read their own record', async () => {
    const token = await accessTokenFor(ownerId);

    const response = await request(app.getHttpServer())
      .get(`/identity/users/${ownerId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(ownerId);
  });

  it('rejects a USER reading another user without permission', async () => {
    const token = await accessTokenFor(ownerId);

    const response = await request(app.getHttpServer())
      .get(`/identity/users/${otherId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.message).toBe(
      'Insufficient permissions',
    );
  });

  it('allows an ADMIN to read another user', async () => {
    const token = await accessTokenFor(adminId);

    const response = await request(app.getHttpServer())
      .get(`/identity/users/${otherId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(otherId);
  });
});
