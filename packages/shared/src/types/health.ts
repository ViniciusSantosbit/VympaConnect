import type { z } from 'zod';
import type { healthSchema } from '../schemas/health.js';
export type HealthResponse = z.infer<typeof healthSchema>;
