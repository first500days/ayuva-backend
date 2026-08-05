import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  CareJourney,
  CareJourneySchema,
} from '../../ai/care-journey/schemas/care-journey.schema';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AuthModule } from '../../auth/auth.module';
import { MedicationsModule } from '../medications/medications.module';
import { RecordsModule } from '../records/records.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [
    AuthModule,
    MedicationsModule,
    RecordsModule,
    AppointmentsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CareJourney.name, schema: CareJourneySchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
