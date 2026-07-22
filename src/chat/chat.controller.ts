import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RagService } from '../rag/rag.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly ragService: RagService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async chat(@Body() body: ChatRequestDto): Promise<ChatResponseDto> {
    return this.ragService.answerQuestion(body.question);
  }
}
