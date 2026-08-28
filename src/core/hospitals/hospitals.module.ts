import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Hospital, HospitalSchema } from './schemas/hospital.schema';
import { HospitalsController } from './hospitals.controller';
import { HospitalsService } from './hospitals.service';
import { ProvidersModule } from '../providers/providers.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    ProvidersModule,
    MongooseModule.forFeature([
      { name: Hospital.name, schema: HospitalSchema },
    ]),
  ],
  controllers: [HospitalsController],
  providers: [HospitalsService],
  exports: [MongooseModule],
})
export class HospitalsModule {}
