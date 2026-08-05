import { Types } from 'mongoose';
import { FeedbackService } from './feedback.service';
import { FeedbackStatus, FeedbackType } from './schemas/feedback-item.schema';

function buildService() {
  const feedbackItemModel = {
    create: jest.fn(),
  };
  const service = new FeedbackService(feedbackItemModel as any);
  return { service, feedbackItemModel };
}

const USER_ID = new Types.ObjectId().toString();

describe('FeedbackService', () => {
  describe('create', () => {
    it('creates a FeedbackItem with reporterId set from the caller and returns it', async () => {
      const { service, feedbackItemModel } = buildService();
      feedbackItemModel.create.mockResolvedValue({
        id: 'item-1',
        type: FeedbackType.BUG,
        title: 'Sync issue',
        description: "BP log didn't sync after re-opening the app.",
        status: FeedbackStatus.OPEN,
        csatScore: 4,
        createdAt: new Date('2026-08-02T10:00:00.000Z'),
      });

      const result = await service.create(USER_ID, {
        type: FeedbackType.BUG,
        title: 'Sync issue',
        description: "BP log didn't sync after re-opening the app.",
        csatScore: 4,
      });

      expect(feedbackItemModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ reporterId: USER_ID, csatScore: 4 }),
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'item-1', status: FeedbackStatus.OPEN }),
      );
    });

    it('creates a FeedbackItem without a csatScore when none is provided', async () => {
      const { service, feedbackItemModel } = buildService();
      feedbackItemModel.create.mockResolvedValue({
        id: 'item-2',
        type: FeedbackType.FEATURE_REQUEST,
        title: 'Dark mode',
        description: 'Would love a dark theme.',
        status: FeedbackStatus.OPEN,
        createdAt: new Date('2026-08-02T10:00:00.000Z'),
      });

      const result = await service.create(USER_ID, {
        type: FeedbackType.FEATURE_REQUEST,
        title: 'Dark mode',
        description: 'Would love a dark theme.',
      });

      expect(result.csatScore).toBeUndefined();
    });
  });
});
