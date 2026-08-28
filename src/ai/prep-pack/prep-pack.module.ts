import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PrepPack, PrepPackSchema } from './schemas/prep-pack.schema';
import { PrepPackController } from './prep-pack.controller';
import { PrepPackService } from './prep-pack.service';
import { AuthModule } from '../../auth/auth.module';
import { AppointmentsModule } from '../../core/appointments/appointments.module';
import { MedicationsModule } from '../../core/medications/medications.module';
import { RecordsModule } from '../../core/records/records.module';

@Module({
  imports: [
    AuthModule,
    AppointmentsModule,
    MedicationsModule,
    RecordsModule,
    MongooseModule.forFeature([{ name: PrepPack.name, schema: PrepPackSchema }]),
  ],
  controllers: [PrepPackController],
  providers: [PrepPackService],
})
export class PrepPackModule {}
