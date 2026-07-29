import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { DatasetService } from './dataset.service';
import { EvaluationResultDto } from './dto/evaluation-result.dto';
import { RunDatasetResponseDto } from './dto/run-dataset-response.dto';
import { RunEvaluationDto } from './dto/run-evaluation.dto';
import { EvaluationService } from './evaluation.service';
import { ReportService } from './report.service';

@Controller('evaluation')
export class EvaluationController {
  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly datasetService: DatasetService,
    private readonly reportService: ReportService,
  ) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async runSingle(@Body() dto: RunEvaluationDto): Promise<EvaluationResultDto> {
    return this.evaluationService.runSingle(dto);
  }

  @Get('dataset')
  async getDataset(): Promise<RunEvaluationDto[]> {
    return this.datasetService.loadDataset();
  }

  @Post('run-dataset')
  @HttpCode(HttpStatus.OK)
  async runDataset(): Promise<RunDatasetResponseDto> {
    const testCases = await this.datasetService.loadDataset();
    const results = await this.evaluationService.runMany(testCases);
    const report = this.reportService.buildReport(results);
    return { results, report };
  }
}
