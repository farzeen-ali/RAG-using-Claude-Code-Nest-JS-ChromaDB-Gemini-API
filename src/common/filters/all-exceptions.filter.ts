import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}

interface MulterLikeError {
  code: string;
  message?: string;
}

/**
 * Single place where every unhandled error in the app is normalized into a
 * consistent JSON shape and a correct status code, so nothing ever bubbles
 * up as a raw stack trace or crashes the process.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message, error } = this.resolve(exception);

    const body: ErrorResponseBody = {
      statusCode,
      message,
      error,
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
    };

    const isServerError = statusCode >= 500;

    if (isServerError) {
      this.logger.error(
        `${request.method} ${body.path} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${body.path} -> ${statusCode}: ${JSON.stringify(message)}`,
      );
    }

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { statusCode: status, message: payload, error: exception.name };
      }

      const payloadObj = payload as {
        message?: string | string[];
        error?: string;
      };
      return {
        statusCode: status,
        message: payloadObj.message ?? exception.message,
        error: payloadObj.error ?? exception.name,
      };
    }

    if (this.isMulterError(exception)) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: this.describeMulterError(exception),
        error: 'BadRequest',
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong. Please try again later.',
      error: 'InternalServerError',
    };
  }

  private isMulterError(exception: unknown): exception is MulterLikeError {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof exception.code === 'string' &&
      exception.code.startsWith('LIMIT_')
    );
  }

  private describeMulterError(exception: MulterLikeError): string {
    if (exception.code === 'LIMIT_FILE_SIZE') {
      return 'Uploaded file exceeds the maximum allowed size.';
    }
    return exception.message ?? 'Invalid file upload.';
  }
}
