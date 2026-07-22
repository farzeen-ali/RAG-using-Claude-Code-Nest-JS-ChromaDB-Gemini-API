import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { HealthStatus } from './app.service';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth(): HealthStatus {
    return this.appService.getHealthStatus();
  }
}
