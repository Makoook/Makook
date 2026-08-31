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

    const owner = await prisma.user.create({
      data: {
        email: `identity-http-owner-${Date.now()}@makook.local`,
      },
    });

    const other = await prisma.user.create({
      data: {
        email: `identity-http-other-${Date.now()}@makook.local`,
      },
    });

    ownerId = owner.id;
    otherId = other.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, otherId] } },
    });

    await app.close();
  });

  async function accessTokenFor(userId: string): Promise<string> {
    return jwtService.signAsync({
      sub: userId,
      sid: 'test-session',
    });
  }

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer())
      .get(`/identity/users/${ownerId}`)
      .expect(401);
  });

  it('returns the record when the token owner requests their own id', async () => {
    const token = await accessTokenFor(ownerId);

    const response = await request(app.getHttpServer())
      .get(`/identity/users/${ownerId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.id).toBe(ownerId);
  });

  it('rejects a request for a different user\'s id (IDOR check)', async () => {
    const token = await accessTokenFor(ownerId);

    const response = await request(app.getHttpServer())
      .get(`/identity/users/${otherId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.message).toBe(
      'You may only access your own user record',
    );
  });
});
