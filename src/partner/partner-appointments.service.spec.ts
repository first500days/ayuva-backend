import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PartnerAppointmentsService } from './partner-appointments.service';
import { AppointmentStatus } from '../core/appointments/schemas/appointment.schema';
import { AppointmentSlotStatus } from '../core/providers/schemas/appointment-slot.schema';
import { MemberStatus } from './staff/schemas/partner-member.schema';

describe('PartnerAppointmentsService - Manual Appointments', () => {
  let service: PartnerAppointmentsService;
  let appointmentModel: any;
  let slotModel: any;
  let memberModel: any;
  let referralModel: any;
  let patients: any;
  let context: any;
  let records: any;
  let reminders: any;
  let notifications: any;
  let audit: any;
  let sharing: any;
  let live: any;

  const mockProviderId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId().toString();
  const mockActor: any = {
    userId: mockUserId,
    provider: { _id: mockProviderId, id: mockProviderId.toString(), name: 'Apollo Clinic' },
    member: { _id: new Types.ObjectId(), fullName: 'Dr. Anita' },
  };

  beforeEach(() => {
    appointmentModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
    };
    slotModel = {
      create: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    memberModel = {
      findOne: jest.fn(),
    };
    referralModel = {
      findOne: jest.fn(),
    };
    patients = {
      assertLinked: jest.fn(),
    };
    context = {
      requireLiveContext: jest.fn().mockResolvedValue({ provider: mockActor.provider, member: mockActor.member }),
      requireLive: jest.fn().mockResolvedValue(mockActor.provider),
    };
    records = {
      describeAppointments: jest.fn(),
    };
    reminders = {
      cancelAppointmentReminder: jest.fn().mockResolvedValue(undefined),
      cancelFollowUpReminder: jest.fn().mockResolvedValue(undefined),
    };
    notifications = {
      create: jest.fn().mockResolvedValue(undefined),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    sharing = {
      revokeForAppointment: jest.fn().mockResolvedValue(undefined),
      syncVisitExpiry: jest.fn().mockResolvedValue(undefined),
    };
    live = {
      publish: jest.fn(),
      slotOpened: jest.fn(),
      toPatient: jest.fn(),
    };

    service = new PartnerAppointmentsService(
      appointmentModel,
      slotModel,
      memberModel,
      referralModel,
      patients,
      context,
      records,
      reminders,
      notifications,
      audit,
      sharing,
      live,
    );
  });

  describe('createManual', () => {
    it('throws BadRequestException if patient name is missing', async () => {
      await expect(
        service.createManual(mockActor, {
          patient: { name: '  ' },
          date: '2026-11-25',
          time: '11:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates manual appointment using existing slotId', async () => {
      const mockSlotId = new Types.ObjectId();
      const mockSlot = {
        _id: mockSlotId,
        id: mockSlotId.toString(),
        date: new Date('2026-11-25T00:00:00.000Z'),
        time: '11:00',
        durationMin: 15,
        status: AppointmentSlotStatus.BOOKED,
      };

      slotModel.findOneAndUpdate.mockResolvedValue(mockSlot);
      slotModel.findById.mockResolvedValue(mockSlot);

      const createdAppt = {
        id: new Types.ObjectId().toString(),
        isManual: true,
        manualPatient: { name: 'Ramesh Kumar', phone: '+919876543210' },
        slotId: mockSlotId,
        providerId: mockProviderId,
        status: AppointmentStatus.CONFIRMED,
      };
      appointmentModel.create.mockResolvedValue(createdAppt);
      appointmentModel.findById.mockResolvedValue(createdAppt);
      records.describeAppointments.mockResolvedValue([
        {
          id: createdAppt.id,
          patientName: 'Ramesh Kumar',
          isManual: true,
          date: '2026-11-25',
          time: '11:00',
        },
      ]);

      const result = await service.createManual(mockActor, {
        patient: { name: 'Ramesh Kumar', phone: '+919876543210' },
        slotId: mockSlotId.toString(),
      });

      expect(appointmentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isManual: true,
          manualPatient: expect.objectContaining({ name: 'Ramesh Kumar', phone: '+919876543210' }),
          slotId: mockSlotId,
          status: AppointmentStatus.CONFIRMED,
        }),
      );
      expect(result.patientName).toBe('Ramesh Kumar');
      expect(result.isManual).toBe(true);
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('creates manual appointment with custom date and time by generating slot', async () => {
      const mockSlotId = new Types.ObjectId();
      const mockCreatedSlot = {
        _id: mockSlotId,
        id: mockSlotId.toString(),
        date: new Date('2026-11-25T00:00:00.000Z'),
        time: '14:30',
        durationMin: 30,
        status: AppointmentSlotStatus.BOOKED,
      };

      slotModel.findOne.mockResolvedValue(null);
      slotModel.create.mockResolvedValue(mockCreatedSlot);
      slotModel.findById.mockResolvedValue(mockCreatedSlot);

      const createdAppt = {
        id: new Types.ObjectId().toString(),
        isManual: true,
        manualPatient: { name: 'Sita Devi', phone: '+919876500000', notes: 'Walk-in fever' },
        slotId: mockSlotId,
        providerId: mockProviderId,
        status: AppointmentStatus.CONFIRMED,
      };
      appointmentModel.create.mockResolvedValue(createdAppt);
      appointmentModel.findById.mockResolvedValue(createdAppt);
      records.describeAppointments.mockResolvedValue([
        {
          id: createdAppt.id,
          patientName: 'Sita Devi',
          isManual: true,
          date: '2026-11-25',
          time: '14:30',
        },
      ]);

      const result = await service.createManual(mockActor, {
        patient: { name: 'Sita Devi', phone: '+919876500000', notes: 'Walk-in fever' },
        date: '2026-11-25',
        time: '14:30',
        durationMin: 30,
      });

      expect(slotModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: mockProviderId,
          time: '14:30',
          durationMin: 30,
          status: AppointmentSlotStatus.BOOKED,
        }),
      );
      expect(result.patientName).toBe('Sita Devi');
      expect(result.isManual).toBe(true);
    });

    it('assigns staff member if memberId is provided', async () => {
      const mockMemberId = new Types.ObjectId();
      memberModel.findOne.mockResolvedValue({
        _id: mockMemberId,
        fullName: 'Dr. John Doe',
        department: 'Cardiology',
      });

      const mockSlotId = new Types.ObjectId();
      const mockSlot = {
        _id: mockSlotId,
        id: mockSlotId.toString(),
        date: new Date('2026-11-25T00:00:00.000Z'),
        time: '11:00',
        durationMin: 15,
        status: AppointmentSlotStatus.BOOKED,
      };
      slotModel.findOneAndUpdate.mockResolvedValue(mockSlot);
      slotModel.findById.mockResolvedValue(mockSlot);

      const createdAppt = {
        id: new Types.ObjectId().toString(),
        isManual: true,
        manualPatient: { name: 'Ramesh' },
        slotId: mockSlotId,
        providerId: mockProviderId,
        assignedMemberId: mockMemberId,
        assignedName: 'Dr. John Doe',
        department: 'Cardiology',
        status: AppointmentStatus.CONFIRMED,
      };
      appointmentModel.create.mockResolvedValue(createdAppt);
      appointmentModel.findById.mockResolvedValue(createdAppt);
      records.describeAppointments.mockResolvedValue([{ id: createdAppt.id, patientName: 'Ramesh' }]);

      await service.createManual(mockActor, {
        patient: { name: 'Ramesh' },
        slotId: mockSlotId.toString(),
        memberId: mockMemberId.toString(),
      });

      expect(appointmentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedMemberId: mockMemberId,
          assignedName: 'Dr. John Doe',
          department: 'Cardiology',
        }),
      );
    });
  });

  describe('reject for manual appointment', () => {
    it('cancels appointment and releases slot without calling patient notification', async () => {
      const mockApptId = new Types.ObjectId().toString();
      const mockSlotId = new Types.ObjectId();
      const apptDoc = {
        id: mockApptId,
        _id: new Types.ObjectId(mockApptId),
        status: AppointmentStatus.CONFIRMED,
        slotId: mockSlotId,
        patientId: undefined, // Non-Ayuva patient
        save: jest.fn().mockResolvedValue(undefined),
      };
      appointmentModel.findOne.mockResolvedValue(apptDoc);
      appointmentModel.findById.mockResolvedValue(apptDoc);
      records.describeAppointments.mockResolvedValue([{ id: mockApptId, status: 'cancelled_by_provider' }]);

      const res = await service.reject(mockUserId, mockApptId, 'Doctor emergency');
      expect(apptDoc.status).toBe(AppointmentStatus.CANCELLED_BY_PROVIDER);
      expect(slotModel.updateOne).toHaveBeenCalledWith(
        { _id: mockSlotId, status: AppointmentSlotStatus.BOOKED },
        { $set: { status: AppointmentSlotStatus.OPEN } },
      );
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });
});
