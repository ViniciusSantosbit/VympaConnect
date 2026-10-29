import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
@Catch(Prisma.PrismaClientKnownRequestError)
export class FinanceConstraintFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = error.code === 'P2002' ? 409 : error.code === 'P2003' ? 400 : 500;
    response.status(status).json({
      statusCode: status,
      message:
        status === 409
          ? 'Registro duplicado ou chave de envio já utilizada. Recarregue para conferir.'
          : status === 400
            ? 'Vínculo financeiro inválido. Recarregue os registros disponíveis.'
            : 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
    });
  }
}
