import { Injectable } from '@nestjs/common';
import { healthSchema, type HealthResponse } from '@vympa/shared';
@Injectable()
export class HealthService {
  getStatus(): HealthResponse {
    return healthSchema.parse({ status: 'ok', service: 'vympa-connect-api' });
  }
}
