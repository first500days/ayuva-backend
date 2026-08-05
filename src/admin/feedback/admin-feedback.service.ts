import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  FeedbackItem,
  FeedbackItemDocument,
  FeedbackStatus,
  FeedbackType,
} from '../../core/feedback/schemas/feedback-item.schema';
import { User, UserDocument } from '../../core/users/schemas/user.schema';
import { QueryAdminFeedbackDto } from './dto/query-admin-feedback.dto';
import { UpdateFeedbackItemDto } from './dto/update-feedback-item.dto';
import { AdminFeedbackResponseDto } from './dto/admin-feedback-response.dto';
import { AdminFeedbackSummaryResponseDto } from './dto/admin-feedback-summary-response.dto';

@Injectable()
export class AdminFeedbackService {
  constructor(
    @InjectModel(FeedbackItem.name)
    private readonly feedbackItemModel: Model<FeedbackItemDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findAll(
    query: QueryAdminFeedbackDto,
  ): Promise<AdminFeedbackResponseDto[]> {
    const items = await this.feedbackItemModel
      .find(query.type ? { type: query.type } : {})
      .sort({ createdAt: -1 })
      .exec();
    if (items.length === 0) return [];

    const reporters = await this.userModel
      .find({ _id: { $in: items.map((i) => i.reporterId) } })
      .exec();
    const reporterById = new Map(reporters.map((r) => [r.id, r]));

    return items.map((i) =>
      this.toResponse(i, reporterById.get(i.reporterId.toString())),
    );
  }

  async getSummary(): Promise<AdminFeedbackSummaryResponseDto> {
    const [openCount, featureRequestCount, bugReportCount, csatAgg] =
      await Promise.all([
        this.feedbackItemModel.countDocuments({ status: FeedbackStatus.OPEN }),
        this.feedbackItemModel.countDocuments({
          type: FeedbackType.FEATURE_REQUEST,
        }),
        this.feedbackItemModel.countDocuments({ type: FeedbackType.BUG }),
        this.feedbackItemModel.aggregate([
          { $match: { csatScore: { $exists: true, $ne: null } } },
          { $group: { _id: null, avg: { $avg: '$csatScore' } } },
        ]),
      ]);

    const averageCsat = csatAgg[0]?.avg
      ? Math.round(csatAgg[0].avg * 10) / 10
      : 0;

    return {
      openCount,
      featureRequestCount,
      bugReportCount,
      averageCsat,
    };
  }

  async update(
    id: string,
    dto: UpdateFeedbackItemDto,
  ): Promise<AdminFeedbackResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Feedback item not found');
    }
    const item = await this.feedbackItemModel.findById(id);
    if (!item) {
      throw new NotFoundException('Feedback item not found');
    }

    if (dto.status !== undefined) item.status = dto.status;
    if (dto.assignedTo !== undefined)
      item.assignedTo = new Types.ObjectId(dto.assignedTo);

    await item.save();
    const reporter = await this.userModel.findById(item.reporterId);
    return this.toResponse(item, reporter ?? undefined);
  }

  private toResponse(
    item: FeedbackItemDocument,
    reporter?: UserDocument,
  ): AdminFeedbackResponseDto {
    return {
      id: item.id,
      reporterId: item.reporterId.toString(),
      reporterName: reporter?.fullName ?? 'Unknown reporter',
      type: item.type,
      title: item.title,
      description: item.description,
      status: item.status,
      assignedTo: item.assignedTo?.toString(),
      createdAt: (item.createdAt ?? new Date(0)).toISOString(),
    };
  }
}
