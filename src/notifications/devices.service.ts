import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DeviceToken, DeviceTokenDocument } from './schemas/device-token.schema';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DevicesService {
  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
  ) {}

  async register(userId: string, dto: RegisterDeviceDto): Promise<void> {
    // A token can migrate between users (device changes hands / re-login) —
    // upsert on the unique token so re-registration reassigns ownership cleanly.
    await this.deviceTokenModel.findOneAndUpdate(
      { token: dto.token },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          platform: dto.platform,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.deviceTokenModel.deleteOne({
      token,
      userId: new Types.ObjectId(userId),
    });
  }
}
