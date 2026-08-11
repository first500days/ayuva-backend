import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AppointmentsModule } from '../../core/appointments/appointments.module';
import { AdminAppointmentsController } from './admin-appointments.controller';

/**
 * Thin RBAC-gated wrapper around the real AppointmentsService (reschedule/
 * cancel atomicity, reminder cancellation) — no separate service layer here
 * to avoid duplicating that logic (PRD Admin Portal Appointment Slot Management).
 */
@Module({
  imports: [AuthModule, AppointmentsModule],
  controllers: [AdminAppointmentsController],
})
export class AdminAppointmentsModule {}
