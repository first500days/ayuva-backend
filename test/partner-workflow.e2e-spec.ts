import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import {
  closeTestApp,
  createTestApp,
  registerAdmin,
  registerPatient,
  TestAppContext,
} from './utils/test-app.util';
import {
  Provider,
  ProviderCategory,
  ProviderStatus,
} from '../src/core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../src/core/providers/schemas/appointment-slot.schema';

describe('Partner booking, operations, admin oversight and billing workflow', () => {
  let ctx: TestAppContext | undefined;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    adminToken = (
      await registerAdmin(ctx.app, { email: 'workflow-admin@example.com' })
    ).accessToken;
  }, 60_000);

  afterAll(async () => {
    if (ctx) await closeTestApp(ctx);
  });

  it('keeps booking, partner operations, admin oversight and billing in sync', async () => {
    const app = ctx!.app;
    const server = app.getHttpServer();
    const partnerRegistration = await request(server)
      .post('/api/v1/partner/auth/register')
      .send({
        fullName: 'Workflow Partner',
        email: 'workflow-partner@example.com',
        password: 'PartnerPassword123',
        organisationName: 'Workflow Clinic',
        type: ProviderCategory.GP,
        specialty: ['General Practice'],
        registrationNumber: 'WF-1234',
        phone: '+911234567890',
        termsAccepted: true,
        privacyAccepted: true,
      })
      .expect(201);
    const partnerToken = partnerRegistration.body.accessToken as string;
    const partnerUserId = partnerRegistration.body.user.id as string;

    const providerModel = app.get<Model<Provider>>(
      getModelToken(Provider.name),
    );
    const provider = await providerModel.findOneAndUpdate(
      { ownerUserId: partnerUserId },
      { status: ProviderStatus.ACTIVE, requiresApproval: true },
      { returnDocument: 'after' },
    );
    expect(provider).not.toBeNull();

    const slotDate = new Date();
    slotDate.setUTCHours(0, 0, 0, 0);
    slotDate.setUTCDate(slotDate.getUTCDate() + 2);
    const slotModel = app.get<Model<AppointmentSlotDocument>>(
      getModelToken(AppointmentSlot.name),
    );
    const slot = await slotModel.create({
      providerId: provider!._id,
      date: slotDate,
      time: '10:00',
      durationMin: 30,
      status: AppointmentSlotStatus.OPEN,
    });

    const { accessToken: patientToken } = await registerPatient(app, {
      email: 'workflow-patient@example.com',
    });
    const booking = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ providerId: provider!.id, slotId: slot.id })
      .expect(201);
    const appointmentId = booking.body.id as string;
    expect(booking.body.status).toBe('requested');

    const partnerQueue = await request(server)
      .get('/api/v1/partner/appointments?scope=incoming')
      .set('Authorization', `Bearer ${partnerToken}`)
      .expect(200);
    expect(partnerQueue.body.map((item: { id: string }) => item.id)).toContain(
      appointmentId,
    );

    await request(server)
      .post(`/api/v1/partner/appointments/${appointmentId}/accept`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .expect(200);

    const patientAppointments = await request(server)
      .get('/api/v1/appointments?scope=upcoming')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    expect(
      patientAppointments.body.find(
        (item: { id: string }) => item.id === appointmentId,
      )?.status,
    ).toBe('confirmed');

    const adminAppointments = await request(server)
      .get(`/api/v1/admin/appointments?providerId=${provider!.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(
      adminAppointments.body.find(
        (item: { id: string }) => item.id === appointmentId,
      )?.status,
    ).toBe('confirmed');

    await request(server)
      .post(`/api/v1/partner/appointments/${appointmentId}/complete`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .expect(200);

    const receipt = await request(server)
      .post('/api/v1/partner/billing/payments')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({
        patientName: 'Workflow Patient',
        description: 'Completed appointment',
        parts: [
          { method: 'cash', amount: 500 },
          { method: 'upi', amount: 250, reference: 'WF-UPI-01' },
        ],
      })
      .expect(201);
    expect(receipt.body.total).toBe(750);

    const voidedReceipt = await request(server)
      .post(`/api/v1/partner/billing/payments/${receipt.body.id}/void`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ reason: 'Workflow test cleanup' })
      .expect(200);
    expect(voidedReceipt.body.status).toBe('VOID');

    const completedAppointments = await request(server)
      .get('/api/v1/appointments?scope=past')
      .set('Authorization', `Bearer ${patientToken}`)
      .expect(200);
    expect(
      completedAppointments.body.find(
        (item: { id: string }) => item.id === appointmentId,
      )?.status,
    ).toBe('completed');
  });
});
