import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FeedbackItem,
  FeedbackItemSchema,
} from '../../core/feedback/schemas/feedback-item.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import { AuthModule } from '../../auth/auth.module';
import { AdminFeedbackController } from './admin-feedback.controller';
import { AdminFeedbackService } from './admin-feedback.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: FeedbackItem.name, schema: FeedbackItemSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminFeedbackController],
  providers: [AdminFeedbackService],
})
export class AdminFeedbackModule {}
