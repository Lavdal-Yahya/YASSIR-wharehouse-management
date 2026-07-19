import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from '../errors/domain-error';

type ErrorResponse = {
  statusCode: number;
  code: string;
  message: string;
};

// Global filter. Priority:
// 1. DomainError            → { statusCode, code, message } — code is the i18n key.
// 2. HttpException (Nest's) → keep its status, use a stable code derived from status.
// 3. Anything else          → log with stack; respond { code: 'INTERNAL' }, 500.
// Stack traces never leave the server (architecture.md §3.9).

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      const body: ErrorResponse = {
        statusCode: exception.httpStatus,
        code: exception.code,
        message: exception.message,
      };
      res.status(exception.httpStatus).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const nestResponse = exception.getResponse();
      const message =
        typeof nestResponse === 'string'
          ? nestResponse
          : ((nestResponse as { message?: string | string[] }).message ?? exception.message);
      const body: ErrorResponse = {
        statusCode: status,
        code: httpStatusToCode(status),
        message: Array.isArray(message) ? message.join('; ') : message,
      };
      res.status(status).json(body);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
      undefined,
      'unhandled',
    );
    const body: ErrorResponse = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: 'Internal server error',
    };
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function httpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    default:
      return 'INTERNAL';
  }
}
