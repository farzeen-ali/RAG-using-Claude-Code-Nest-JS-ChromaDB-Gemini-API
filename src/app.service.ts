import { Injectable } from '@nestjs/common';

export interface HealthStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Injectable()
export class AppService {
  getHealthStatus(): HealthStatus {
    return {
      status: 'ok',
      service: 'enterprise-rag-api',
      timestamp: new Date().toISOString(),
    };
  }
}
