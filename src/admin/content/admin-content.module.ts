import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Content, ContentSchema } from '../../core/content/schemas/content.schema';
import { AdminContentController } from './admin-content.controller';
import { AdminContentService } from './admin-content.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([{ name: Content.name, schema: ContentSchema }]),
  ],
  controllers: [AdminContentController],
  providers: [AdminContentService],
  exports: [AdminContentService],
})
export class AdminContentModule {}
