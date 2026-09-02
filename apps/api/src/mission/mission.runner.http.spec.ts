import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
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

import { AuthModule } from '../auth/auth.module.js';
import { MissionModule } from './mission.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MissionStatus } from '../generated/prisma/enums.js';

describe('Mission Runner - HTTP Security', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let customerId: string;
  let runner1Id: string;
  let runner2Id: string;
  let normalUserId: string;

  let customerSessionId: string;
  let runner1SessionId: string;
  let runner2SessionId: string;
  let normalUserSessionId: string;

  const createdMissionIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule, MissionModule],
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

    const customer = await prisma.user.create({
      data: {
        email: `runner-http-customer-${timestamp}@makook.local`,
      },
    });

    const runner1 = await prisma.user.create({
      data: {
        email: `runner-http-runner1-${timestamp}@makook.local`,
      },
    });

    const runner2 = await prisma.user.create({
      data: {
        email: `runner-http-runner2-${timestamp}@makook.local`,
      },
    });

    const normalUser = await prisma.user.create({
      data: {
        email: `runner-http-user-${timestamp}@makook.local`,
      },
    });

    customerId = customer.id;
    runner1Id = runner1.id;
    runner2Id = runner2.id;
    normalUserId = normalUser.id;

    createdUserIds.push(
      customerId,
      runner1Id,
      runner2Id,
      normalUserId,
    );

    const userRole = await prisma.role.findUnique({
      where: { name: 'USER' },
    });

    const runnerRole = await prisma.role.findUnique({
      where: { name: 'RUNNER' },
    });

    if (!userRole || !runnerRole) {
      throw new Error(
        'Required USER/RUNNER roles were not found',
      );
    }

    await prisma.userRole.createMany({
      data: [
        {
          userId: customerId,
          roleId: userRole.id,
        },
        {
          userId: runner1Id,
          roleId: runnerRole.id,
        },
        {
          userId: runner2Id,
          roleId: runnerRole.id,
        },
        {
          userId: normalUserId,
          roleId: userRole.id,
        },
      ],
    });

    const sessions = await Promise.all(
      [
        [customerId, 'customer'],
        [runner1Id, 'runner1'],
        [runner2Id, 'runner2'],
        [normalUserId, 'normal'],
      ].map(async ([userId, label]) => {
        return prisma.session.create({
          data: {
            userId,
            familyId: `runner-http-${label}-family-${timestamp}`,
            refreshTokenHash:
              `runner-http-${label}-refresh-${timestamp}`,
            expiresAt: new Date(
              Date.now() + 60 * 60 * 1000,
            ),
          },
        });
      }),
    );

    [
      customerSessionId,
      runner1SessionId,
      runner2SessionId,
      normalUserSessionId,
    ] = sessions.map((session) => session.id);

    createdSessionIds.push(
      customerSessionId,
      runner1SessionId,
      runner2SessionId,
      normalUserSessionId,
    );
  });

  afterAll(async () => {
    if (!prisma) return;

    if (createdMissionIds.length) {
      await prisma.mission.deleteMany({
        where: {
          id: { in: createdMissionIds },
        },
      });
    }

    if (createdSessionIds.length) {
      await prisma.session.deleteMany({
        where: {
          id: { in: createdSessionIds },
        },
      });
    }

    if (createdUserIds.length) {
      await prisma.userRole.deleteMany({
        where: {
          userId: { in: createdUserIds },
        },
      });

      await prisma.user.deleteMany({
        where: {
          id: { in: createdUserIds },
        },
      });
    }

    await app?.close();
  });

  async function tokenFor(
    userId: string,
  ): Promise<string> {
    const sessionId =
      userId === customerId
        ? customerSessionId
        : userId === runner1Id
          ? runner1SessionId
          : userId === runner2Id
            ? runner2SessionId
            : normalUserSessionId;

    return jwtService.signAsync({
      sub: userId,
      sid: sessionId,
    });
  }

  async function createPublishedMission(): Promise<string> {
    const token = await tokenFor(customerId);

    const createResponse = await request(
      app.getHttpServer(),
    )
      .post('/missions')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);

    const missionId = createResponse.body.id;
    createdMissionIds.push(missionId);

    await request(app.getHttpServer())
      .patch(`/missions/${missionId}/publish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    return missionId;
  }

  it('rejects an unauthenticated runner request', async () => {
    await request(app.getHttpServer())
      .get('/missions/available')
      .expect(401);
  });

  it('rejects an authenticated USER without runner permission', async () => {
    const token = await tokenFor(normalUserId);

    await request(app.getHttpServer())
      .get('/missions/available')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('allows a RUNNER to read available missions', async () => {
    const missionId = await createPublishedMission();
    const token = await tokenFor(runner1Id);

    const response = await request(
      app.getHttpServer(),
    )
      .get('/missions/available')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(
      response.body.some(
        (mission: { id: string }) =>
          mission.id === missionId,
      ),
    ).toBe(true);
  });

  it('allows a RUNNER to accept an OPEN mission', async () => {
    const missionId = await createPublishedMission();
    const token = await tokenFor(runner1Id);

    const response = await request(
      app.getHttpServer(),
    )
      .post(`/missions/${missionId}/accept`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body.id).toBe(missionId);
    expect(response.body.status).toBe(
      MissionStatus.ACCEPTED,
    );
    expect(response.body.runnerId).toBe(runner1Id);
  });

  it('blocks IDOR against another runner assigned mission', async () => {
    const missionId = await createPublishedMission();

    const runner1Token = await tokenFor(runner1Id);
    const runner2Token = await tokenFor(runner2Id);

    await request(app.getHttpServer())
      .post(`/missions/${missionId}/accept`)
      .set('Authorization', `Bearer ${runner1Token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/missions/${missionId}/start`)
      .set('Authorization', `Bearer ${runner2Token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/missions/${missionId}/complete`)
      .set('Authorization', `Bearer ${runner2Token}`)
      .expect(403);
  });

  it('allows only the assigned runner to execute the lifecycle', async () => {
    const missionId = await createPublishedMission();
    const runner1Token = await tokenFor(runner1Id);

    await request(app.getHttpServer())
      .post(`/missions/${missionId}/accept`)
      .set('Authorization', `Bearer ${runner1Token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/missions/${missionId}/start`)
      .set('Authorization', `Bearer ${runner1Token}`)
      .expect(201);

    const response = await request(
      app.getHttpServer(),
    )
      .post(`/missions/${missionId}/complete`)
      .set('Authorization', `Bearer ${runner1Token}`)
      .expect(201);

    expect(response.body.status).toBe(
      MissionStatus.COMPLETED,
    );
  });

  it('allows exactly one runner to win concurrent acceptance', async () => {
    const missionId = await createPublishedMission();

    const runner1Token = await tokenFor(runner1Id);
    const runner2Token = await tokenFor(runner2Id);

    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`/missions/${missionId}/accept`)
        .set(
          'Authorization',
          `Bearer ${runner1Token}`,
        ),
      request(app.getHttpServer())
        .post(`/missions/${missionId}/accept`)
        .set(
          'Authorization',
          `Bearer ${runner2Token}`,
        ),
    ]);

    const successful = results.filter(
      ({ status }) =>
        status >= 200 && status < 300,
    );

    const conflicts = results.filter(
      ({ status }) => status === 409,
    );

    expect(successful).toHaveLength(1);
    expect(conflicts).toHaveLength(1);

    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
    });

    expect(mission?.status).toBe(
      MissionStatus.ACCEPTED,
    );

    expect(
      [runner1Id, runner2Id].includes(
        mission?.runnerId ?? '',
      ),
    ).toBe(true);
  });

  it('does not allow a RUNNER to read another customer mission', async () => {
    const missionId = await createPublishedMission();
    const runnerToken = await tokenFor(runner1Id);

    await request(app.getHttpServer())
      .get(`/missions/${missionId}`)
      .set('Authorization', `Bearer ${runnerToken}`)
      .expect(403);
  });
});
