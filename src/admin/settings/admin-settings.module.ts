import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSettings, SystemSettingsSchema } from './schemas/system-settings.schema';
import { AdminSettingsService } from './admin-settings.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SystemSettings.name, schema: SystemSettingsSchema }]),
    AuditLogModule,
  ],
  controllers: [AdminSettingsController],
  providers: [AdminSettingsService],
  exports: [AdminSettingsService],
})
export class AdminSettingsModule {}
