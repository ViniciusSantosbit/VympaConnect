import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { ContractsService } from './contracts.service.js';
import { commercialLock } from '../clients/commercial-support.js';
import type { DocumentDto } from '../clients/commercial.dto.js';
@Injectable()
export class ContractDocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly contracts: ContractsService,
  ) {}
  async list(id: string, actor: string, role: string) {
    await this.contracts.require(id, actor, role);
    return {
      uploadEnabled: false,
      pending:
        'Armazenamento privado ainda não configurado e validado. Somente metadados; nenhum arquivo foi enviado.',
      items: await this.db.contractDocument.findMany({
        where: { contractId: id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  async metadata(id: string, dto: DocumentDto, actor: string, role: string) {
    return this.db.$transaction(async (tx) => {
      await commercialLock(tx);
      await this.contracts.require(id, actor, role, tx);
      const row = await tx.contractDocument.create({
        data: { ...dto, contractId: id, actorId: actor },
      });
      await this.contracts.record(
        tx,
        id,
        actor,
        'CONTRACT_DOCUMENT_METADATA',
        'Referência documental cadastrada; upload pendente.',
        null,
        { documentId: row.id },
      );
      return row;
    });
  }
  async blocked(id: string, actor: string, role: string) {
    await this.contracts.require(id, actor, role);
    throw new ServiceUnavailableException(
      'Upload e leitura de arquivos bloqueados até a validação de armazenamento privado.',
    );
  }
}
