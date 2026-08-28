import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShareGrant, ShareGrantSchema } from './schemas/share-grant.schema';
import { ShareOrganisation, ShareOrganisationSchema } from './schemas/share-organisation.schema';
import { AccessLog, AccessLogSchema } from './schemas/access-log.schema';
import { SharingController } from './sharing.controller';
import { SharingService } from './sharing.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: ShareGrant.name, schema: ShareGrantSchema },
      { name: ShareOrganisation.name, schema: ShareOrganisationSchema },
      { name: AccessLog.name, schema: AccessLogSchema },
    ]),
  ],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
