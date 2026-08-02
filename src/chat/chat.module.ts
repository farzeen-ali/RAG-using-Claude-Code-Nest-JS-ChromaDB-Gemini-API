import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { ChatController } from './chat.controller';

@Module({
  imports: [MemoryModule],
  controllers: [ChatController],
})
export class ChatModule {}
