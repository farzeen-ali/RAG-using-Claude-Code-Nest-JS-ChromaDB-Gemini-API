export class UploadResponseDto {
  success: boolean;
  filename: string;
  pageCount: number;
  chunksIndexed: number;
  message: string;
}
