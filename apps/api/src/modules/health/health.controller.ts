import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@vympa/shared';
import { HealthService } from './health.service.js';
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get()
  @ApiOkResponse({
    description: 'Liveness público. Não consulta o banco.',
    schema: {
      type: 'object',
      required: ['status', 'service'],
      properties: {
        status: { type: 'string', enum: ['ok'] },
        service: { type: 'string', enum: ['vympa-connect-api'] },
      },
    },
  })
  getStatus(): HealthResponse {
    return this.health.getStatus();
  }
}
