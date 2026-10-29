import {
  Body,
  Controller,
  Get,
  Header,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthRequest } from '../auth/auth.types.js';
import { Roles } from '../auth/auth.guards.js';
import { FinanceConstraintFilter } from '../finance/finance-constraint.filter.js';
import { ClientsService } from './clients.service.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { ContractDocumentsService } from '../contracts/contract-documents.service.js';
import {
  ActivityDto,
  AmendmentDto,
  ClientDto,
  ClientServiceDto,
  ClientStateDto,
  CommercialFiltersDto,
  ContactDto,
  ContractDto,
  ContractStateDto,
  ConvertLeadDto,
  DocumentDto,
  RenewalDto,
  UpdateClientDto,
  UpdateContractDto,
} from './commercial.dto.js';
const profile = (r: AuthRequest) => r.auth.profile!;
@ApiTags('Clientes')
@ApiCookieAuth()
@UseFilters(FinanceConstraintFilter)
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly contracts: ContractsService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @Query() q: CommercialFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.list(q, profile(r).id, profile(r).role);
  }
  @Post() create(@Body() d: ClientDto, @Req() r: AuthRequest) {
    return this.clients.create(d, profile(r).id, profile(r).role);
  }
  @Post('from-lead/:id')
  @ApiOperation({ summary: 'Converter ou vincular lead sem apagar histórico e sem gerar receita' })
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ConvertLeadDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.convert(id, d, profile(r).id, profile(r).role);
  }
  @Get(':id') @Header('Cache-Control', 'no-store') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.clients.get(id, profile(r).id, profile(r).role);
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateClientDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.update(id, d, profile(r).id, profile(r).role);
  }
  @Patch(':id/status') @Roles('OWNER') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClientStateDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.state(id, d, profile(r).id, profile(r).role);
  }
  @Get(':id/activity') @Header('Cache-Control', 'no-store') activity(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CommercialFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.activity(id, profile(r).id, profile(r).role, q);
  }
  @Post(':id/activity') note(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ActivityDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.note(id, d.body, profile(r).id, profile(r).role);
  }
  @Post(':id/contacts') contact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ContactDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.contact(id, d, profile(r).id, profile(r).role);
  }
  @Patch(':id/contacts/:contactId') contactEdit(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body() d: ContactDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.contact(id, d, profile(r).id, profile(r).role, contactId);
  }
  @Post(':id/services') service(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ClientServiceDto,
    @Req() r: AuthRequest,
  ) {
    return this.clients.service(id, d, profile(r).id, profile(r).role);
  }
  @Get(':id/contracts') @Header('Cache-Control', 'no-store') async contractsList(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: CommercialFiltersDto,
    @Req() r: AuthRequest,
  ) {
    await this.clients.require(id, profile(r).id, profile(r).role);
    return this.contracts.list({ ...q, clientId: id }, profile(r).id, profile(r).role);
  }
  @Get(':id/financial') @Roles('OWNER') @Header('Cache-Control', 'no-store') financial(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.financial(id, profile(r).id, profile(r).role);
  }
}
@ApiTags('Contratos')
@ApiCookieAuth()
@UseFilters(FinanceConstraintFilter)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contracts: ContractsService,
    private readonly documents: ContractDocumentsService,
  ) {}
  @Get('summary') @Header('Cache-Control', 'no-store') summary(@Req() r: AuthRequest) {
    return this.contracts.summary(profile(r).id, profile(r).role);
  }
  @Get('expiring') @Header('Cache-Control', 'no-store') expiring(
    @Query() q: CommercialFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.expiring(q, profile(r).id, profile(r).role);
  }
  @Get() @Header('Cache-Control', 'no-store') list(
    @Query() q: CommercialFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.list(q, profile(r).id, profile(r).role);
  }
  @Post() create(@Body() d: ContractDto, @Req() r: AuthRequest) {
    return this.contracts.create(d, profile(r).id, profile(r).role);
  }
  @Get(':id') @Header('Cache-Control', 'no-store') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.get(id, profile(r).id, profile(r).role);
  }
  @Patch(':id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateContractDto,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.update(id, d, profile(r).id, profile(r).role);
  }
  @Patch(':id/status') @Roles('OWNER') state(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ContractStateDto,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.state(id, d, profile(r).id, profile(r).role);
  }
  @Post(':id/amendments') @Roles('OWNER') amend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AmendmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.amend(id, d, profile(r).id, profile(r).role);
  }
  @Post(':id/renewals') @Roles('OWNER') renew(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RenewalDto,
    @Req() r: AuthRequest,
  ) {
    return this.contracts.renew(id, d, profile(r).id, profile(r).role);
  }
  @Get(':id/documents') @Header('Cache-Control', 'no-store') docs(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.documents.list(id, profile(r).id, profile(r).role);
  }
  @Post(':id/documents') metadata(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: DocumentDto,
    @Req() r: AuthRequest,
  ) {
    return this.documents.metadata(id, d, profile(r).id, profile(r).role);
  }
  @Post(':id/documents/upload') upload(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.documents.blocked(id, profile(r).id, profile(r).role);
  }
  @Get(':id/documents/:documentId/download') download(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.documents.blocked(id, profile(r).id, profile(r).role);
  }
}
@Module({
  controllers: [ClientsController, ContractsController],
  providers: [ClientsService, ContractsService, ContractDocumentsService],
  exports: [ClientsService, ContractsService],
})
export class ClientsModule {}
