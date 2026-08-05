import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  registerPatient,
  registerAdmin,
  TestAppContext,
} from './utils/test-app.util';

/**
 * Every /admin/* route requires role=admin (RolesGuard + @Roles(admin), TRD §4).
 * One representative endpoint per admin group is exercised with a patient JWT
 * (expect 403) and an admin JWT (expect a non-403 success) to prove the guard
 * actually discriminates rather than just being wired up and never enforced.
 */
describe('Admin RBAC enforcement', () => {
  let ctx: TestAppContext;
  let patientToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const patient = await registerPatient(ctx.app, {
      email: 'rbac-patient@example.com',
    });
    patientToken = patient.accessToken;
    const admin = await registerAdmin(ctx.app, {
      email: 'rbac-admin@example.com',
    });
    adminToken = admin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  const endpoints: { group: string; method: 'get'; path: string }[] = [
    { group: 'Analytics', method: 'get', path: '/api/v1/admin/analytics/overview' },
    { group: 'Users', method: 'get', path: '/api/v1/admin/users' },
    { group: 'Providers', method: 'get', path: '/api/v1/admin/providers' },
    { group: 'AI Monitoring', method: 'get', path: '/api/v1/admin/ai/overview' },
    { group: 'Reports', method: 'get', path: '/api/v1/admin/reports' },
    { group: 'Feedback', method: 'get', path: '/api/v1/admin/feedback' },
  ];

  it.each(endpoints)(
    '$group: rejects a non-admin (patient) JWT with 403',
    async ({ path }) => {
      const server = ctx.app.getHttpServer();
      await request(server)
        .get(path)
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);
    },
  );

  it.each(endpoints)(
    '$group: allows an admin JWT through',
    async ({ path }) => {
      const server = ctx.app.getHttpServer();
      await request(server)
        .get(path)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    },
  );

  it('rejects requests with no JWT at all with 401', async () => {
    const server = ctx.app.getHttpServer();
    await request(server).get('/api/v1/admin/analytics/overview').expect(401);
  });
});
