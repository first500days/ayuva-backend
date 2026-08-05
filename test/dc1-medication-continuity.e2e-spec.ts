import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  registerPatient,
  TestAppContext,
} from './utils/test-app.util';

/**
 * PRD DC-1: "Medications entered in Health Profile (Module 2) must appear in
 * Medication Reminder (Module 10)". This proves the specific path end-to-end
 * over real HTTP, not just that each endpoint works in isolation.
 */
describe('DC-1: medication continuity (POST /profile/medications -> GET /medications/today)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('a medication added during onboarding is immediately visible in the daily medication list', async () => {
    const server = ctx.app.getHttpServer();
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc1@example.com',
    });

    await request(server)
      .post('/api/v1/profile/medications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Metformin',
        dosage: '500 mg',
        frequency: 'Twice daily',
        scheduleTimes: ['08:00', '20:00'],
      })
      .expect(201);

    const todayRes = await request(server)
      .get('/api/v1/medications/today')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const metforminItems = todayRes.body.items.filter(
      (i: { name: string }) => i.name === 'Metformin',
    );
    expect(metforminItems).toHaveLength(2);
    expect(
      metforminItems
        .map((i: { scheduleTime: string }) => i.scheduleTime)
        .sort(),
    ).toEqual(['08:00', '20:00']);
    expect(todayRes.body.adherence.totalCount).toBeGreaterThanOrEqual(2);
  });

  it('an "as needed" medication (no scheduleTimes) still appears as a single today item', async () => {
    const server = ctx.app.getHttpServer();
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc1-asneeded@example.com',
    });

    await request(server)
      .post('/api/v1/profile/medications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Salbutamol',
        dosage: '2 puffs',
        frequency: 'As needed',
        scheduleTimes: [],
      })
      .expect(201);

    const todayRes = await request(server)
      .get('/api/v1/medications/today')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(todayRes.body.items).toHaveLength(1);
    expect(todayRes.body.items[0]).toMatchObject({
      name: 'Salbutamol',
      scheduleTime: null,
      status: 'upcoming',
    });
  });

  it('a fresh account with no medications yet does not error (FR-2.6 onboarding is skippable)', async () => {
    const server = ctx.app.getHttpServer();
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc1-empty@example.com',
    });

    const todayRes = await request(server)
      .get('/api/v1/medications/today')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(todayRes.body).toEqual({
      items: [],
      adherence: { takenCount: 0, totalCount: 0, percent: 0 },
    });
  });
});
