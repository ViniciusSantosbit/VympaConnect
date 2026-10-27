import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500) this.logger.error({ status, requestId: request.id }, 'Erro interno na API');
    const payload = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      status >= 500
        ? 'Erro interno do servidor'
        : typeof payload === 'object' && payload !== null && 'message' in payload
          ? payload.message
          : 'Solicitação não permitida';
    response.status(status).json({
      statusCode: status,
      message,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  }
}
