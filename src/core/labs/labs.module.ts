import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lab, LabSchema } from './schemas/lab.schema';
import { DiagnosticTest, DiagnosticTestSchema } from './schemas/diagnostic-test.schema';
import { LabsController, TestsController } from './labs.controller';
import { LabsService, TestsService } from './labs.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Lab.name, schema: LabSchema },
      { name: DiagnosticTest.name, schema: DiagnosticTestSchema },
    ]),
  ],
  controllers: [LabsController, TestsController],
  providers: [LabsService, TestsService],
  exports: [MongooseModule],
})
export class LabsModule {}
