import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module.js';
import request from 'supertest';

describe('RATE LIMIT - X-FORWARDED-FOR BYPASS', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('must enforce rate limiting despite X-Forwarded-For changes', async () => {
    const statuses: number[] = [];

    for (let i = 0; i < 110; i++) {
      const response = await request(app.getHttpServer())
        .get('/health')
        .set('X-Forwarded-For', `10.0.0.${i + 1}`);

      statuses.push(response.status);
    }

    const rateLimited = statuses.filter((status) => status === 429).length;

    expect(rateLimited).toBeGreaterThan(0);
  });
});
