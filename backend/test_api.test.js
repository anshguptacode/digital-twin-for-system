const request = require('supertest');
const app = require('./server');

describe('API Endpoints', () => {
  afterAll(async () => {
    if (app.shutdown) await app.shutdown();
  });
  it('GET /api/health should return ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });

  it('POST /api/login should fail without credentials', async () => {
    const res = await request(app).post('/api/login').send({});
    expect(res.statusCode).toEqual(400);
  });

  it('GET /api/history should require authentication', async () => {
    const res = await request(app).get('/api/history');
    expect(res.statusCode).toEqual(401);
  });
});
