import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'question must not be empty' })
  @MaxLength(2000, { message: 'question must be 2000 characters or fewer' })
  question: string;
}
