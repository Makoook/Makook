import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module.js';

describe('Global HTTP Rate Limit', () => {
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

  it('returns 429 after exceeding the global limit', async () => {
    const server = app.getHttpServer();

    let lastResponse: request.Response | undefined;

    for (let i = 0; i < 101; i++) {
      lastResponse = await request(server).get('/health');
    }

    expect(lastResponse?.status).toBe(429);
  }, 30000);
});
