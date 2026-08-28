import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NavIntent, NavIntentSchema } from './schemas/nav-intent.schema';
import { NavIntentController } from './nav-intent.controller';
import { NavIntentService } from './nav-intent.service';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: NavIntent.name, schema: NavIntentSchema }]),
  ],
  controllers: [NavIntentController],
  providers: [NavIntentService],
})
export class NavIntentModule {}
