import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  registerPatient,
  registerAdmin,
  TestAppContext,
} from './utils/test-app.util';

/**
 * PRD FR-13.4: deactivating a provider from the admin side must exclude it
 * from patient-facing search/detail immediately. Exercises both endpoints in
 * sequence — creating the provider via the admin API, confirming a patient
 * can see it, deactivating it via the admin API, then confirming the same
 * patient-facing endpoints stop returning it — so an admin-only unit test
 * of ProviderStatus can't mask a missing filter on the patient side.
 */
describe('FR-13.4: deactivated provider excluded from patient-facing search', () => {
  let ctx: TestAppContext;
  let adminToken: string;
  let patientToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await registerAdmin(ctx.app, {
      email: 'fr134-admin@example.com',
    });
    adminToken = admin.accessToken;
    const patient = await registerPatient(ctx.app, {
      email: 'fr134-patient@example.com',
    });
    patientToken = patient.accessToken;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('an active provider is visible to patients; deactivating it removes it from search and detail', async () => {
    const server = ctx.app.getHttpServer();

    const createRes = await request(server)
      .post('/api/v1/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Dr. FR134 Test',
        type: 'GP',
        specialty: ['General Practitioner'],
        locations: [{ label: 'Test Clinic', address: '1 Test Street' }],
        languages: ['EN'],
      })
      .expect(201);
    const providerId = createRes.body.id as string;

    const searchBefore = await request(server)
      .get('/api/v1/providers')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    expect(searchBefore.body.some((p: { id: string }) => p.id === providerId)).toBe(
      true,
    );

    await request(server)
      .get(`/api/v1/providers/${providerId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);

    await request(server)
      .patch(`/api/v1/admin/providers/${providerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'inactive' })
      .expect(200);

    const searchAfter = await request(server)
      .get('/api/v1/providers')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    expect(searchAfter.body.some((p: { id: string }) => p.id === providerId)).toBe(
      false,
    );

    await request(server)
      .get(`/api/v1/providers/${providerId}`)
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(404);

    // The admin view still sees it — deactivation isn't a delete.
    const adminList = await request(server)
      .get('/api/v1/admin/providers')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const adminRow = adminList.body.find(
      (p: { id: string }) => p.id === providerId,
    );
    expect(adminRow?.status).toBe('inactive');
  });
});
