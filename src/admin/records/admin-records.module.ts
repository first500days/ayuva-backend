import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MedicalRecord, MedicalRecordSchema } from '../../core/records/schemas/medical-record.schema';
import { User, UserSchema } from '../../core/users/schemas/user.schema';
import { AdminRecordsController } from './admin-records.controller';
import { AdminRecordsService } from './admin-records.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: MedicalRecord.name, schema: MedicalRecordSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AdminRecordsController],
  providers: [AdminRecordsService],
  exports: [AdminRecordsService],
})
export class AdminRecordsModule {}
