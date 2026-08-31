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
import { AuthModule } from './auth.module.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('AuthController - Refresh Endpoint', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
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

    const user = await prisma.user.create({
      data: {
        email: `auth-controller-test-${Date.now()}@makook.local`,
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({
        where: {
          userId,
        },
      });

      await prisma.user.delete({
        where: {
          id: userId,
        },
      });
    }

    await app.close();
  });

  it('refreshes a valid session and rotates the refresh token', async () => {
    const oldRefreshToken =
      await createTestSessionAndGetRefreshToken();

    const oldSession = await prisma.session.findFirst({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(oldSession).not.toBeNull();

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        sessionId: oldSession!.id,
        refreshToken: oldRefreshToken,
      })
      .expect(201);

    expect(response.body.sessionId).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.accessToken).toBeTruthy();

    expect(response.body.sessionId).not.toBe(
      oldSession!.id,
    );

    expect(response.body.refreshToken).not.toBe(
      oldRefreshToken,
    );

    const revokedOldSession =
      await prisma.session.findUnique({
        where: {
          id: oldSession!.id,
        },
      });

    expect(revokedOldSession).not.toBeNull();
    expect(revokedOldSession?.revokedAt).not.toBeNull();

    const newSession = await prisma.session.findUnique({
      where: {
        id: response.body.sessionId,
      },
    });

    expect(newSession).not.toBeNull();
    expect(newSession?.userId).toBe(userId);
    expect(newSession?.familyId).toBe(
      revokedOldSession?.familyId,
    );
    expect(newSession?.revokedAt).toBeNull();
  });

  it('rejects the old refresh token after rotation', async () => {
    const oldRefreshToken =
      await createTestSessionAndGetRefreshToken();

    const oldSession = await prisma.session.findFirst({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(oldSession).not.toBeNull();

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        sessionId: oldSession!.id,
        refreshToken: oldRefreshToken,
      })
      .expect(201);

    const secondResponse = await request(
      app.getHttpServer(),
    )
      .post('/auth/refresh')
      .send({
        sessionId: oldSession!.id,
        refreshToken: oldRefreshToken,
      })
      .expect(401);

    expect(secondResponse.body.message).toBe(
      'Invalid refresh token',
    );
  });

  it('rejects an invalid refresh token', async () => {
    const oldRefreshToken =
      await createTestSessionAndGetRefreshToken();

    const oldSession = await prisma.session.findFirst({
      where: {
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    expect(oldSession).not.toBeNull();

    const response = await request(
      app.getHttpServer(),
    )
      .post('/auth/refresh')
      .send({
        sessionId: oldSession!.id,
        refreshToken: `${oldRefreshToken}-invalid`,
      })
      .expect(401);

    expect(response.body.message).toBe(
      'Invalid refresh token',
    );
  });

  it('rejects requests with unexpected properties', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/auth/refresh')
      .send({
        sessionId: '00000000-0000-0000-0000-000000000000',
        refreshToken: 'test-token',
        admin: true,
      })
      .expect(400);

    expect(response.body.message).toContain(
      'property admin should not exist',
    );
  });

  it('rejects requests without sessionId', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/auth/refresh')
      .send({
        refreshToken: 'test-token',
      })
      .expect(400);

    expect(response.body.message).toContain(
      'sessionId should not be empty',
    );
  });

  it('rejects requests without refreshToken', async () => {
    const response = await request(
      app.getHttpServer(),
    )
      .post('/auth/refresh')
      .send({
        sessionId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(400);

    expect(response.body.message).toContain(
      'refreshToken should not be empty',
    );
  });

  async function createTestSessionAndGetRefreshToken(): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const crypto = await import('node:crypto');

      const refreshToken = crypto
        .randomBytes(48)
        .toString('base64url');

      const refreshTokenHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      const expiresAt = new Date();

      expiresAt.setDate(
        expiresAt.getDate() + 30,
      );

      await tx.session.create({
        data: {
          userId,
          familyId: userId,
          refreshTokenHash,
          expiresAt,
        },
      });

      return refreshToken;
    });
  }
});

describe('AuthController - Logout Endpoint', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
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

    const user = await prisma.user.create({
      data: {
        email: `auth-logout-test-${Date.now()}@makook.local`,
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({
        where: {
          userId,
        },
      });

      await prisma.user.delete({
        where: {
          id: userId,
        },
      });
    }

    await app.close();
  });

  async function createActiveSession() {
    return prisma.session.create({
      data: {
        userId,
        familyId: userId,
        refreshTokenHash: 'not-checked-by-logout',
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ),
      },
    });
  }

  it('rejects a logout request with no access token', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(401);
  });

  it('rejects a logout request with a malformed access token', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('revokes the session named in the caller\'s own access token', async () => {
    const session = await createActiveSession();

    const accessToken = await jwtService.signAsync({
      sub: userId,
      sid: session.id,
    });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const revoked = await prisma.session.findUnique({
      where: { id: session.id },
    });

    expect(revoked?.revokedAt).not.toBeNull();
  });

  it('is idempotent when the session is already revoked', async () => {
    const session = await createActiveSession();

    const accessToken = await jwtService.signAsync({
      sub: userId,
      sid: session.id,
    });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const revoked = await prisma.session.findUnique({
      where: { id: session.id },
    });

    expect(revoked?.revokedAt).not.toBeNull();
  });
});