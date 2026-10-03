import { Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { AdminController } from '../common/decorators/controllers';
import { APP_VERSION } from '../common/version';
import { AppConfig } from '../config/app-config.service';
import { SystemInfoDto } from './dto/stats.dto';

@AdminController('system')
export class AdminSystemController {
  constructor(private readonly config: AppConfig) {}

  @Get('info')
  @ApiOperation({ summary: 'Server version and the timing settings the panel displays' })
  @ApiOkResponse({ type: SystemInfoDto })
  info(): SystemInfoDto {
    return {
      version: APP_VERSION,
      sessionTimeoutMinutes: this.config.get('SESSION_TIMEOUT_MINUTES'),
      heartbeatGraceSeconds: this.config.get('HEARTBEAT_GRACE_SECONDS'),
      deviceOnlineThresholdSeconds: this.config.get('DEVICE_ONLINE_THRESHOLD_SECONDS'),
      disconnectTtlSeconds: this.config.get('DISCONNECT_TTL_SECONDS'),
    };
  }
}
