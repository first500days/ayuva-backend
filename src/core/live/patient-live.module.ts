import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PatientLiveGateway } from './patient-live.gateway';

/** The patient app's live connection (visit status on the home screen). */
@Module({
  imports: [AuthModule],
  providers: [PatientLiveGateway],
})
export class PatientLiveModule {}
