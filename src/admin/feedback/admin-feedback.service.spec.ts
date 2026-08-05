import { AdminFeedbackService } from './admin-feedback.service';

function buildService() {
  const feedbackItemModel = {
    find: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  };
  const userModel = {
    find: jest.fn(),
    findById: jest.fn(),
  };
  const service = new AdminFeedbackService(
    feedbackItemModel as any,
    userModel as any,
  );
  return { service, feedbackItemModel, userModel };
}

describe('AdminFeedbackService', () => {
  describe('getSummary (FR-17.2)', () => {
    it('returns zeroed tiles and averageCsat 0 when there is no feedback yet', async () => {
      const { service, feedbackItemModel } = buildService();
      feedbackItemModel.countDocuments.mockResolvedValue(0);
      feedbackItemModel.aggregate.mockResolvedValue([]);

      const result = await service.getSummary();

      expect(result).toEqual({
        openCount: 0,
        featureRequestCount: 0,
        bugReportCount: 0,
        averageCsat: 0,
      });
    });

    it('computes averageCsat only over items with a csatScore set, rounded to one decimal', async () => {
      const { service, feedbackItemModel } = buildService();
      feedbackItemModel.countDocuments
        .mockResolvedValueOnce(4) // openCount
        .mockResolvedValueOnce(2) // featureRequestCount
        .mockResolvedValueOnce(1); // bugReportCount
      feedbackItemModel.aggregate.mockResolvedValue([{ _id: null, avg: 4.25 }]);

      const result = await service.getSummary();

      expect(result).toEqual({
        openCount: 4,
        featureRequestCount: 2,
        bugReportCount: 1,
        averageCsat: 4.3,
      });
    });
  });
});
