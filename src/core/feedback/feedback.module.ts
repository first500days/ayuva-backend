import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FeedbackItem,
  FeedbackItemSchema,
} from './schemas/feedback-item.schema';
import { AuthModule } from '../../auth/auth.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/** Patient-facing feedback submission (PRD Module 17). Admin Feedback Management lives under src/admin/feedback. */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: FeedbackItem.name, schema: FeedbackItemSchema },
    ]),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService],
  exports: [MongooseModule],
})
export class FeedbackModule {}
