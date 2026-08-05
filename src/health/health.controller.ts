import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

class HealthResponseDto {
  status: 'ok' | 'degraded';
  mongo: 'connected' | 'connecting' | 'disconnected';
  uptimeSeconds: number;
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness/readiness check' })
  @ApiOkResponse({ type: HealthResponseDto })
  check(): HealthResponseDto {
    const mongoStates = [
      'disconnected',
      'connected',
      'connecting',
      'disconnecting',
    ] as const;
    const mongoState =
      mongoStates[this.mongoConnection.readyState as 0 | 1 | 2 | 3] ??
      'disconnected';

    return {
      status: mongoState === 'connected' ? 'ok' : 'degraded',
      mongo:
        mongoState === 'connected'
          ? 'connected'
          : mongoState === 'connecting'
            ? 'connecting'
            : 'disconnected',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
