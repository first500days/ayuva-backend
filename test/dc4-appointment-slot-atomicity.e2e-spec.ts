import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
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
import { Appointment } from '../src/core/appointments/schemas/appointment.schema';

/**
 * PRD DC-4: booking an AppointmentSlot must atomically flip it open -> booked
 * so two concurrent bookings can never both win the same slot.
 */
describe('DC-4: appointment slot atomicity', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  async function seedProviderWithOpenSlot() {
    const providerModel = ctx.app.get<Model<Provider>>(
      getModelToken(Provider.name),
    );
    const slotModel = ctx.app.get<Model<AppointmentSlotDocument>>(
      getModelToken(AppointmentSlot.name),
    );

    const provider = await providerModel.create({
      name: 'Dr. Test Provider',
      type: ProviderCategory.GP,
      specialty: ['General Practitioner'],
      locations: [{ label: 'Test Clinic', address: '1 Test Street' }],
      languages: ['EN'],
      rating: 4.5,
      avgWaitMinutes: 30,
      status: ProviderStatus.ACTIVE,
    });
    const slot = await slotModel.create({
      providerId: provider._id,
      date: new Date('2026-09-01'),
      time: '10:00',
      durationMin: 30,
      status: AppointmentSlotStatus.OPEN,
    });

    return { provider, slot, slotModel };
  }

  it('booking a slot flips it from open to booked', async () => {
    const server = ctx.app.getHttpServer();
    const { provider, slot, slotModel } = await seedProviderWithOpenSlot();
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc4-single@example.com',
    });

    await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ providerId: provider.id, slotId: slot.id })
      .expect(201);

    const updated = await slotModel.findById(slot.id);
    expect(updated?.status).toBe(AppointmentSlotStatus.BOOKED);
  });

  it('booking an already-booked slot is rejected with 409', async () => {
    const server = ctx.app.getHttpServer();
    const { provider, slot } = await seedProviderWithOpenSlot();
    const { accessToken: token1 } = await registerPatient(ctx.app, {
      email: 'dc4-first@example.com',
    });
    const { accessToken: token2 } = await registerPatient(ctx.app, {
      email: 'dc4-second@example.com',
    });

    await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token1}`)
      .send({ providerId: provider.id, slotId: slot.id })
      .expect(201);

    await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token2}`)
      .send({ providerId: provider.id, slotId: slot.id })
      .expect(409);
  });

  it('under concurrent requests for the same slot, exactly one booking succeeds and one is rejected', async () => {
    const server = ctx.app.getHttpServer();
    const { provider, slot, slotModel } = await seedProviderWithOpenSlot();
    const { accessToken: token1 } = await registerPatient(ctx.app, {
      email: 'dc4-race-1@example.com',
    });
    const { accessToken: token2 } = await registerPatient(ctx.app, {
      email: 'dc4-race-2@example.com',
    });

    const [res1, res2] = await Promise.all([
      request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token1}`)
        .send({ providerId: provider.id, slotId: slot.id }),
      request(server)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${token2}`)
        .send({ providerId: provider.id, slotId: slot.id }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const updatedSlot = await slotModel.findById(slot.id);
    expect(updatedSlot?.status).toBe(AppointmentSlotStatus.BOOKED);

    const appointmentModel = ctx.app.get<Model<Appointment>>(
      getModelToken(Appointment.name),
    );
    const count = await appointmentModel.countDocuments({ slotId: slot.id });
    expect(count).toBe(1);
  });

  it('cancelling an appointment releases its slot back to open', async () => {
    const server = ctx.app.getHttpServer();
    const { provider, slot, slotModel } = await seedProviderWithOpenSlot();
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc4-cancel@example.com',
    });

    const bookRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ providerId: provider.id, slotId: slot.id })
      .expect(201);

    await request(server)
      .patch(`/api/v1/appointments/${bookRes.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'cancelled' })
      .expect(200);

    const updated = await slotModel.findById(slot.id);
    expect(updated?.status).toBe(AppointmentSlotStatus.OPEN);
  });
});
