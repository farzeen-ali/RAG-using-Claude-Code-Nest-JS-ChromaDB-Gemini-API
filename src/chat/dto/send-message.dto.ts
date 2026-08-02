import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty({ message: 'sessionId must not be empty' })
  @MaxLength(100, { message: 'sessionId must be 100 characters or fewer' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'sessionId may only contain letters, numbers, hyphens, and underscores',
  })
  sessionId: string;

  @IsString()
  @IsNotEmpty({ message: 'prompt must not be empty' })
  @MaxLength(2000, { message: 'prompt must be 2000 characters or fewer' })
  prompt: string;
}
