import { isExpoPushToken } from './expo-push.sender';
import { FcmPayload, FcmSender } from './fcm-sender.interface';

/** Sends each token the way it can be delivered: Expo tokens to Expo, native tokens to Firebase. */
export class RoutingPushSender implements FcmSender {
  constructor(
    private readonly native: FcmSender,
    private readonly expo: FcmSender,
  ) {}

  private pick(token: string): FcmSender {
    return isExpoPushToken(token) ? this.expo : this.native;
  }

  send(token: string, payload: FcmPayload): Promise<void> {
    return this.pick(token).send(token, payload);
  }

  sendAndWake(token: string, payload: FcmPayload): Promise<void> {
    return this.pick(token).sendAndWake(token, payload);
  }
}
