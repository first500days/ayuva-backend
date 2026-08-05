import { AdminAnalyticsService } from './admin-analytics.service';

function buildService() {
  const userModel = { countDocuments: jest.fn() };
  const appointmentModel = { countDocuments: jest.fn(), distinct: jest.fn() };
  const slotModel = { countDocuments: jest.fn() };
  const aiInteractionLogModel = { countDocuments: jest.fn(), aggregate: jest.fn() };
  const reportInterpretationModel = { countDocuments: jest.fn() };
  const medicationModel = { distinct: jest.fn() };
  const medicalRecordModel = { distinct: jest.fn() };
  const providerModel = { distinct: jest.fn() };

  const service = new AdminAnalyticsService(
    userModel as any,
    appointmentModel as any,
    slotModel as any,
    aiInteractionLogModel as any,
    reportInterpretationModel as any,
    medicationModel as any,
    medicalRecordModel as any,
    providerModel as any,
  );
  return {
    service,
    userModel,
    appointmentModel,
    slotModel,
    aiInteractionLogModel,
    reportInterpretationModel,
    medicationModel,
    medicalRecordModel,
    providerModel,
  };
}

describe('AdminAnalyticsService', () => {
  describe('getOverview — trend deltas (FR-11.1) and usage breakdown (FR-11.3)', () => {
    it('computes 0 trendPercent everywhere when there is no prior-period data (avoids divide-by-zero)', async () => {
      const {
        service,
        userModel,
        appointmentModel,
        slotModel,
        aiInteractionLogModel,
        reportInterpretationModel,
        medicationModel,
        medicalRecordModel,
        providerModel,
      } = buildService();

      userModel.countDocuments.mockResolvedValue(0);
      appointmentModel.countDocuments.mockResolvedValue(0);
      slotModel.countDocuments.mockResolvedValue(0);
      aiInteractionLogModel.countDocuments.mockResolvedValue(0);
      reportInterpretationModel.countDocuments.mockResolvedValue(0);
      appointmentModel.distinct.mockResolvedValue([]);
      medicationModel.distinct.mockResolvedValue([]);
      medicalRecordModel.distinct.mockResolvedValue([]);
      providerModel.distinct.mockResolvedValue([]);

      const result = await service.getOverview();

      expect(result.totalUsersTrendPercent).toBe(0);
      expect(result.activeUsersTrendPercent).toBe(0);
      expect(result.appointments.trendPercent).toBe(0);
      expect(result.providerUtilisation.trendPercent).toBe(0);
      expect(result.reportsReadTrendPercent).toBe(0);
      expect(result.usageByModule).toEqual([
        { module: 'appointments', adoptionPercent: 0 },
        { module: 'medications', adoptionPercent: 0 },
        { module: 'records', adoptionPercent: 0 },
        { module: 'providers-saved', adoptionPercent: 0 },
      ]);
    });

    it('computes a positive trendPercent when current-period counts exceed the prior period', async () => {
      const {
        service,
        userModel,
        appointmentModel,
        slotModel,
        aiInteractionLogModel,
        reportInterpretationModel,
        medicationModel,
        medicalRecordModel,
        providerModel,
      } = buildService();

      // totalUsers (awaited alone first), then Promise.all order:
      // activeUsers, totalAppointments, upcoming, completed, cancelled, bookedSlots, openSlots,
      // aiInteractionsTotal, reportsRead, totalUsers7d, totalUsersPrev7d, activeUsers7d,
      // activeUsersPrev7d, appointments7d, appointmentsPrev7d, bookedSlots7d, bookedSlotsPrev7d,
      // reportsRead7d, reportsReadPrev7d
      userModel.countDocuments
        .mockResolvedValueOnce(100) // totalUsers
        .mockResolvedValueOnce(80) // activeUsers
        .mockResolvedValueOnce(20) // totalUsers7d
        .mockResolvedValueOnce(10) // totalUsersPrev7d
        .mockResolvedValueOnce(16) // activeUsers7d
        .mockResolvedValueOnce(8); // activeUsersPrev7d

      appointmentModel.countDocuments
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(20) // upcoming
        .mockResolvedValueOnce(25) // completed
        .mockResolvedValueOnce(5) // cancelled
        .mockResolvedValueOnce(12) // appointments7d
        .mockResolvedValueOnce(6); // appointmentsPrev7d

      slotModel.countDocuments
        .mockResolvedValueOnce(30) // bookedSlots
        .mockResolvedValueOnce(70) // openSlots
        .mockResolvedValueOnce(9) // bookedSlots7d
        .mockResolvedValueOnce(3); // bookedSlotsPrev7d

      aiInteractionLogModel.countDocuments.mockResolvedValueOnce(0);

      reportInterpretationModel.countDocuments
        .mockResolvedValueOnce(10) // reportsRead
        .mockResolvedValueOnce(4) // reportsRead7d
        .mockResolvedValueOnce(2); // reportsReadPrev7d

      appointmentModel.distinct.mockResolvedValue(['p1', 'p2']);
      medicationModel.distinct.mockResolvedValue(['p1']);
      medicalRecordModel.distinct.mockResolvedValue(['p1', 'p2', 'p3']);
      providerModel.distinct.mockResolvedValue([]);

      const result = await service.getOverview();

      expect(result.totalUsersTrendPercent).toBe(100); // (20-10)/10*100
      expect(result.activeUsersTrendPercent).toBe(100); // (16-8)/8*100
      expect(result.appointments.trendPercent).toBe(100); // (12-6)/6*100
      expect(result.providerUtilisation.trendPercent).toBe(200); // (9-3)/3*100
      expect(result.reportsReadTrendPercent).toBe(100); // (4-2)/2*100
      expect(result.usageByModule).toEqual([
        { module: 'appointments', adoptionPercent: 2 }, // 2/100
        { module: 'medications', adoptionPercent: 1 },
        { module: 'records', adoptionPercent: 3 },
        { module: 'providers-saved', adoptionPercent: 0 },
      ]);
    });
  });

  describe('getAiInteractionsOverTime (FR-11.2)', () => {
    it('returns 8 periods, defaulting missing periods to a zero count', async () => {
      const { service, aiInteractionLogModel } = buildService();
      aiInteractionLogModel.aggregate.mockResolvedValue([]);

      const result = await service.getAiInteractionsOverTime('weekly');

      expect(result).toHaveLength(8);
      expect(result.every((p) => p.count === 0)).toBe(true);
    });

    it('defaults to weekly when no period is given', async () => {
      const { service, aiInteractionLogModel } = buildService();
      aiInteractionLogModel.aggregate.mockResolvedValue([]);

      const result = await service.getAiInteractionsOverTime();

      expect(result).toHaveLength(8);
    });
  });
});
