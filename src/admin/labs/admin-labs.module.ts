import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lab, LabSchema } from '../../core/labs/schemas/lab.schema';
import { AdminLabsController } from './admin-labs.controller';
import { AdminLabsService } from './admin-labs.service';
import { AuthModule } from '../../auth/auth.module';
import { AuditLogModule } from '../../audit-log/audit-log.module';
import { AdminDiagnosticTestsModule } from '../diagnostic-tests/admin-diagnostic-tests.module';
import { AdminLabDeliveriesModule } from '../lab-deliveries/admin-lab-deliveries.module';

@Module({
  imports: [
    AuthModule,
    AuditLogModule,
    AdminDiagnosticTestsModule,
    AdminLabDeliveriesModule,
    MongooseModule.forFeature([{ name: Lab.name, schema: LabSchema }]),
  ],
  controllers: [AdminLabsController],
  providers: [AdminLabsService],
  exports: [AdminLabsService],
})
export class AdminLabsModule {}