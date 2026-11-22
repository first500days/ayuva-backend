import { Global, Module } from '@nestjs/common';
import { WsUpgradeRouter } from '../../partner/live/ws-upgrade-router.service';
import { LiveBus } from './live-bus.service';

/**
 * Global so patient-side code (e.g. booking) can announce changes without
 * importing the partner module. The upgrade router lives here too: the partner
 * and admin sockets must share one, or each would refuse the other's paths.
 */
@Global()
@Module({
  providers: [LiveBus, WsUpgradeRouter],
  exports: [LiveBus, WsUpgradeRouter],
})
export class LiveModule {}
