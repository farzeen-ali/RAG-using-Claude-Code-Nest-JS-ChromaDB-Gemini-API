import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { AppConfig } from '../config/configuration';
import { RunEvaluationDto } from './dto/run-evaluation.dto';

/**
 * Loads and validates the evaluation dataset — a plain JSON array living at
 * the project root (evaluation-dataset.json by default), editable directly
 * by anyone taking the course. Kept deliberately simple (no upload
 * endpoint, no database) so "add a test case" is just "edit a JSON file".
 */
@Injectable()
export class DatasetService {
  private readonly logger = new Logger(DatasetService.name);
  private readonly datasetPath: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const configuredPath = this.configService.get('evaluation.datasetPath', {
      infer: true,
    });
    this.datasetPath = resolve(process.cwd(), configuredPath);
  }

  async loadDataset(): Promise<RunEvaluationDto[]> {
    let raw: string;
    try {
      raw = await fs.readFile(this.datasetPath, 'utf-8');
    } catch {
      throw new NotFoundException(
        `Evaluation dataset not found at "${this.datasetPath}". Create it as a JSON array of ` +
          '{ "question", "expectedAnswer", "referenceContext"? } objects — see README.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BadRequestException(`"${this.datasetPath}" is not valid JSON.`);
    }

    const testCases = this.validateTestCases(parsed);
    this.logger.log(
      `Loaded ${testCases.length} test case(s) from "${this.datasetPath}".`,
    );
    return testCases;
  }

  private validateTestCases(parsed: unknown): RunEvaluationDto[] {
    if (!Array.isArray(parsed)) {
      throw new BadRequestException(
        'The evaluation dataset must be a JSON array of test cases.',
      );
    }
    if (parsed.length === 0) {
      throw new BadRequestException(
        'The evaluation dataset is empty — add at least one test case.',
      );
    }

    return parsed.map((item, index) => this.validateTestCase(item, index));
  }

  private validateTestCase(item: unknown, index: number): RunEvaluationDto {
    if (typeof item !== 'object' || item === null) {
      throw new BadRequestException(
        `Test case at index ${index} must be an object.`,
      );
    }

    const { question, expectedAnswer, referenceContext } = item as Record<
      string,
      unknown
    >;

    if (typeof question !== 'string' || !question.trim()) {
      throw new BadRequestException(
        `Test case at index ${index} is missing a non-empty "question".`,
      );
    }
    if (typeof expectedAnswer !== 'string' || !expectedAnswer.trim()) {
      throw new BadRequestException(
        `Test case at index ${index} is missing a non-empty "expectedAnswer".`,
      );
    }
    if (
      referenceContext !== undefined &&
      typeof referenceContext !== 'string'
    ) {
      throw new BadRequestException(
        `Test case at index ${index} has an invalid "referenceContext" (must be a string).`,
      );
    }

    const testCase = new RunEvaluationDto();
    testCase.question = question.trim();
    testCase.expectedAnswer = expectedAnswer.trim();
    if (referenceContext?.trim())
      testCase.referenceContext = referenceContext.trim();
    return testCase;
  }
}
