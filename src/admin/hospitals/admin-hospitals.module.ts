import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hospital, HospitalSchema } from '../../core/hospitals/schemas/hospital.schema';
import { AdminHospitalsController } from './admin-hospitals.controller';
import { AdminHospitalsService } from './admin-hospitals.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    MongooseModule.forFeature([{ name: Hospital.name, schema: HospitalSchema }]),
  ],
  controllers: [AdminHospitalsController],
  providers: [AdminHospitalsService],
  exports: [AdminHospitalsService],
})
export class AdminHospitalsModule {}
