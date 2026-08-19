import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lab, LabSchema } from './schemas/lab.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Lab.name, schema: LabSchema }]),
  ],
  exports: [MongooseModule],
})
export class LabsModule {}
