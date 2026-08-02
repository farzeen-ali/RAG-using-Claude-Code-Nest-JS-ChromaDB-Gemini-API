import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ConversationService } from '../memory/conversation.service';
import { ChatResponseDto } from './dto/chat-response.dto';
import { SendMessageDto } from './dto/send-message.dto';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

@Controller('chat')
export class ChatController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() dto: SendMessageDto): Promise<ChatResponseDto> {
    return this.conversationService.sendMessage(dto.sessionId, dto.prompt);
  }

  @Delete(':sessionId')
  @HttpCode(HttpStatus.OK)
  async clearMemory(
    @Param('sessionId') sessionId: string,
  ): Promise<{ sessionId: string; message: string }> {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      throw new BadRequestException(
        'sessionId must be a non-empty string of letters, numbers, hyphens, and underscores (max 100 characters).',
      );
    }

    await this.conversationService.clearMemory(sessionId);
    return { sessionId, message: 'Memory Cleared' };
  }
}
