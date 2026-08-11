import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditAction, AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface RecordAuditEventParams {
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditLogModel: Model<AuditLogDocument>,
  ) {}

  async record(params: RecordAuditEventParams): Promise<void> {
    await this.auditLogModel.create({
      actorId: new Types.ObjectId(params.actorId),
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ? new Types.ObjectId(params.targetId) : undefined,
      metadata: params.metadata,
      ipAddress: params.ipAddress,
    });
  }
}
