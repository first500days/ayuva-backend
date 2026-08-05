import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import request from 'supertest';
import {
  createTestApp,
  closeTestApp,
  registerPatient,
  registerAdmin,
  TestAppContext,
} from './utils/test-app.util';
import {
  Provider,
  ProviderCategory,
  ProviderStatus,
  WorkingDay,
} from '../src/core/providers/schemas/provider.schema';
import {
  AppointmentSlot,
  AppointmentSlotDocument,
  AppointmentSlotStatus,
} from '../src/core/providers/schemas/appointment-slot.schema';
import { Appointment, AppointmentDocument } from '../src/core/appointments/schemas/appointment.schema';

const DOW_TO_WORKING_DAY: WorkingDay[] = [
  WorkingDay.SUN,
  WorkingDay.MON,
  WorkingDay.TUE,
  WorkingDay.WED,
  WorkingDay.THU,
  WorkingDay.FRI,
  WorkingDay.SAT,
];

/**
 * PRD DC-4 (admin side): changing a provider's schedule or adding a blocked
 * date must regenerate/invalidate AppointmentSlot availability without
 * corrupting a slot that's already booked from Phase 2 — the underlying
 * Appointment must never be silently deleted or orphaned.
 */
describe('DC-4 (admin): schedule changes and blocked dates never corrupt a booked slot', () => {
  let ctx: TestAppContext;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await registerAdmin(ctx.app, {
      email: 'dc4-admin@example.com',
    });
    adminToken = admin.accessToken;
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  async function seedProviderWithOpenSlot(dateOffsetDays: number) {
    const providerModel = ctx.app.get<Model<Provider>>(
      getModelToken(Provider.name),
    );
    const slotModel = ctx.app.get<Model<AppointmentSlotDocument>>(
      getModelToken(AppointmentSlot.name),
    );

    const provider = await providerModel.create({
      name: 'Dr. DC4 Admin Test',
      type: ProviderCategory.GP,
      specialty: ['General Practitioner'],
      locations: [{ label: 'Test Clinic', address: '1 Test Street' }],
      languages: ['EN'],
      rating: 4.5,
      avgWaitMinutes: 30,
      status: ProviderStatus.ACTIVE,
    });

    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + dateOffsetDays);

    const slot = await slotModel.create({
      providerId: provider._id,
      date,
      time: '10:00',
      durationMin: 30,
      status: AppointmentSlotStatus.OPEN,
    });

    return { provider, slot, slotModel, date };
  }

  it('PUT .../schedule regenerates availability but leaves an already-booked slot untouched', async () => {
    const server = ctx.app.getHttpServer();
    const { provider, slot, slotModel, date } = await seedProviderWithOpenSlot(3);
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc4-admin-schedule-patient@example.com',
    });

    const bookRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ providerId: provider.id, slotId: slot.id })
      .expect(201);
    const appointmentId = bookRes.body.id as string;

    // Deliberately exclude the booked slot's own weekday from the new schedule,
    // so regeneration has every incentive to want to drop that day's slots.
    const bookedWeekday = DOW_TO_WORKING_DAY[date.getUTCDay()];
    const otherWorkingDays = Object.values(WorkingDay).filter(
      (d) => d !== bookedWeekday,
    );

    await request(server)
      .put(`/api/v1/admin/providers/${provider.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        workingDays: otherWorkingDays,
        startTime: '09:00',
        endTime: '17:00',
        slotDurationMin: 30,
      })
      .expect(200);

    const slotAfter = await slotModel.findById(slot.id);
    expect(slotAfter).not.toBeNull();
    expect(slotAfter?.status).toBe(AppointmentSlotStatus.BOOKED);
    expect(slotAfter?.time).toBe('10:00');
    expect(slotAfter?.durationMin).toBe(30);

    const appointmentModel = ctx.app.get<Model<AppointmentDocument>>(
      getModelToken(Appointment.name),
    );
    const appointmentAfter = await appointmentModel.findById(appointmentId);
    expect(appointmentAfter).not.toBeNull();
    expect(appointmentAfter?.status).toBe('confirmed');
    expect(appointmentAfter?.slotId.toString()).toBe(slot.id);

    const getRes = await request(server)
      .get('/api/v1/appointments?scope=upcoming')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(
      getRes.body.some((a: { id: string }) => a.id === appointmentId),
    ).toBe(true);
  });

  it('POST .../blocked-dates blocks open slots on that date but leaves the booked slot/appointment intact', async () => {
    const server = ctx.app.getHttpServer();
    const { provider, slot, slotModel, date } = await seedProviderWithOpenSlot(5);
    const { accessToken } = await registerPatient(ctx.app, {
      email: 'dc4-admin-blocked-patient@example.com',
    });

    // A second, still-open slot on the same date should get blocked.
    const openSlot = await slotModel.create({
      providerId: provider._id,
      date,
      time: '11:00',
      durationMin: 30,
      status: AppointmentSlotStatus.OPEN,
    });

    const bookRes = await request(server)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ providerId: provider.id, slotId: slot.id })
      .expect(201);
    const appointmentId = bookRes.body.id as string;

    const isoDate = date.toISOString().slice(0, 10);
    await request(server)
      .post(`/api/v1/admin/providers/${provider.id}/blocked-dates`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ date: isoDate, reason: 'Public holiday' })
      .expect(201);

    const bookedSlotAfter = await slotModel.findById(slot.id);
    expect(bookedSlotAfter).not.toBeNull();
    expect(bookedSlotAfter?.status).toBe(AppointmentSlotStatus.BOOKED);

    const openSlotAfter = await slotModel.findById(openSlot.id);
    expect(openSlotAfter?.status).toBe(AppointmentSlotStatus.BLOCKED);

    const appointmentModel = ctx.app.get<Model<AppointmentDocument>>(
      getModelToken(Appointment.name),
    );
    const appointmentAfter = await appointmentModel.findById(appointmentId);
    expect(appointmentAfter).not.toBeNull();
    expect(appointmentAfter?.status).toBe('confirmed');
    expect(appointmentAfter?.slotId.toString()).toBe(slot.id);
  });
});
