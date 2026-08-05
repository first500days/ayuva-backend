import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { REMINDER_QUEUE, REMINDER_QUEUE_NAME } from './reminder-queue.constants';

/** Dedicated BullMQ connection — kept separate from the shared ioredis
 * REDIS_CLIENT since BullMQ requires maxRetriesPerRequest: null (TRD §2/§7). */
export const reminderQueueProvider: Provider = {
  provide: REMINDER_QUEUE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    return new Queue(REMINDER_QUEUE_NAME, {
      connection: {
        host: config.get<string>('redis.host'),
        port: config.get<number>('redis.port'),
        password: config.get<string>('redis.password'),
        maxRetriesPerRequest: null,
      },
    });
  },
};
