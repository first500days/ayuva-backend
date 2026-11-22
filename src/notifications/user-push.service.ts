import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DeviceToken, DeviceTokenDocument } from './schemas/device-token.schema';
import { FCM_SENDER, PushTokenGoneError } from './fcm/fcm-sender.interface';
import type { FcmPayload, FcmSender } from './fcm/fcm-sender.interface';

/** Pushes to every phone a person is signed in on, and forgets tokens that have died. */
@Injectable()
export class UserPushService {
  private readonly logger = new Logger(UserPushService.name);

  constructor(
    @InjectModel(DeviceToken.name)
    private readonly tokens: Model<DeviceTokenDocument>,
    @Inject(FCM_SENDER) private readonly sender: FcmSender,
  ) {}

  async send(
    userId: string,
    payload: FcmPayload,
    options: { wake?: boolean } = {},
  ): Promise<{ devices: number; delivered: number }> {
    const devices = await this.tokens
      .find({ userId: new Types.ObjectId(userId) })
      .exec();
    const results = await Promise.allSettled(
      devices.map((d) =>
        options.wake
          ? this.sender.sendAndWake(d.token, payload)
          : this.sender.send(d.token, payload),
      ),
    );
    const dead: string[] = [];
    let delivered = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') delivered += 1;
      else if (r.reason instanceof PushTokenGoneError) dead.push(devices[i].token);
      else this.logger.warn(`Push failed for user ${userId}: ${String(r.reason)}`);
    });
    if (dead.length) await this.tokens.deleteMany({ token: { $in: dead } });
    return { devices: devices.length, delivered };
  }
}
