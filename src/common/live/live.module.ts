import { Global, Module } from '@nestjs/common';
import { LiveBus } from './live-bus.service';

/** Global so patient-side code (e.g. booking) can announce changes without importing the partner module. */
@Global()
@Module({
  providers: [LiveBus],
  exports: [LiveBus],
})
export class LiveModule {}
