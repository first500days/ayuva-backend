import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CareJourney, CareJourneySchema } from './schemas/care-journey.schema';

/** Schema registration only. Care Journey endpoints (TRD §4.2, §5.2) land in Phase 2. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CareJourney.name, schema: CareJourneySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class CareJourneyModule {}
