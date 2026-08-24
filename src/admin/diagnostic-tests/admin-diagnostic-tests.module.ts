import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DiagnosticTest, DiagnosticTestSchema } from '../../core/labs/schemas/diagnostic-test.schema';
import { AdminDiagnosticTestsService } from './admin-diagnostic-tests.service';
import { AdminDiagnosticTestsController } from './admin-diagnostic-tests.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DiagnosticTest.name, schema: DiagnosticTestSchema }]),
  ],
  controllers: [AdminDiagnosticTestsController],
  providers: [AdminDiagnosticTestsService],
  exports: [AdminDiagnosticTestsService],
})
export class AdminDiagnosticTestsModule {}