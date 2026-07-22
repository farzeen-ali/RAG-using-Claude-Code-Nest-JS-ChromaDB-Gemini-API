import {
  Controller,
  HttpCode,
  HttpStatus,
  ParseFilePipeBuilder,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_SIZE_BYTES } from '../common/constants/upload.constants';
import { RagService } from '../rag/rag.service';
import { UploadResponseDto } from './dto/upload-response.dto';

const PDF_MIME_TYPE = /^application\/pdf$/;

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly ragService: RagService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } }),
  )
  async upload(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({ fileType: PDF_MIME_TYPE })
        .addMaxSizeValidator({ maxSize: MAX_UPLOAD_SIZE_BYTES })
        .build({
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
          fileIsRequired: true,
        }),
    )
    file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    return this.ragService.ingestDocument(file);
  }
}
