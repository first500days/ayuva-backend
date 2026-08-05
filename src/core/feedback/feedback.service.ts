import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FeedbackItem,
  FeedbackItemDocument,
} from './schemas/feedback-item.schema';
import { CreateFeedbackItemDto } from './dto/create-feedback-item.dto';
import { FeedbackItemResponseDto } from './dto/feedback-item-response.dto';

// Patient-facing feedback submission (PRD Module 17 / FR-17.2 CSAT capture).
@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(FeedbackItem.name)
    private readonly feedbackItemModel: Model<FeedbackItemDocument>,
  ) {}

  async create(
    userId: string,
    dto: CreateFeedbackItemDto,
  ): Promise<FeedbackItemResponseDto> {
    const item = await this.feedbackItemModel.create({
      reporterId: userId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      csatScore: dto.csatScore,
    });
    return this.toResponse(item);
  }

  private toResponse(item: FeedbackItemDocument): FeedbackItemResponseDto {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      status: item.status,
      csatScore: item.csatScore,
      createdAt: (item.createdAt ?? new Date()).toISOString(),
    };
  }
}
