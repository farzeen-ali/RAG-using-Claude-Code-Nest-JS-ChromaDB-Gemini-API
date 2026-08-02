import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsInt()
  PORT?: number;

  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV?: string;

  @IsString()
  GEMINI_API_KEY: string;

  @IsOptional()
  @IsString()
  GEMINI_CHAT_MODEL?: string;

  @IsOptional()
  @IsString()
  GEMINI_EMBEDDING_MODEL?: string;

  @IsOptional()
  @IsInt()
  GEMINI_EMBEDDING_DIMENSIONS?: number;

  @IsOptional()
  @IsString()
  CHROMA_HOST?: string;

  @IsOptional()
  @IsInt()
  CHROMA_PORT?: number;

  @IsOptional()
  @IsBooleanString()
  CHROMA_SSL?: string;

  @IsOptional()
  @IsString()
  CHROMA_COLLECTION_NAME?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  CHUNK_SIZE?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  CHUNK_OVERLAP?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  RETRIEVAL_TOP_K?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  RETRIEVAL_CANDIDATE_K?: number;

  @IsOptional()
  @IsString()
  EVALUATION_DATASET_PATH?: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsInt()
  REDIS_PORT?: number;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  @IsOptional()
  @IsInt()
  @Min(60, { message: 'REDIS_TTL_SECONDS should be at least 60 (1 minute)' })
  REDIS_TTL_SECONDS?: number;
}

// Fails fast on boot with a readable error instead of surfacing missing-config
// failures later as opaque Gemini/Chroma runtime errors.
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  return validatedConfig;
}
