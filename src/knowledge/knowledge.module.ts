import { Module } from '@nestjs/common';
import { RagModule } from '../rag/rag.module';
import { KnowledgeController } from './knowledge.controller';

@Module({
  imports: [RagModule],
  controllers: [KnowledgeController],
})
export class KnowledgeModule {}
