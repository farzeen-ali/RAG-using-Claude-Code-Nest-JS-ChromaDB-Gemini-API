import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Validated shape for POST /evaluation/run. Also reused (structurally, not
 * through class-validator) as the TypeScript type for each entry loaded from
 * evaluation-dataset.json by DatasetService — same three fields either way.
 */
export class RunEvaluationDto {
  @IsString()
  @IsNotEmpty({ message: 'question must not be empty' })
  @MaxLength(2000, { message: 'question must be 2000 characters or fewer' })
  question: string;

  @IsString()
  @IsNotEmpty({ message: 'expectedAnswer must not be empty' })
  @MaxLength(4000, {
    message: 'expectedAnswer must be 4000 characters or fewer',
  })
  expectedAnswer: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000, {
    message: 'referenceContext must be 8000 characters or fewer',
  })
  referenceContext?: string;
}
