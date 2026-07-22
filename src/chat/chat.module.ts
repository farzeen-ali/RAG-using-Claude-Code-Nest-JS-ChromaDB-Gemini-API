import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { ChatController } from './chat.controller';

@Module({
  imports: [RagModule],
  controllers: [ChatController],
})
export class ChatModule {}
