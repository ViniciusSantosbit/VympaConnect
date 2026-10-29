import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Req,
  Module,
  ParseUUIDPipe,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, IsArray, ArrayMaxSize } from 'class-validator';
import type { AuthRequest } from '../auth/auth.types.js';
import {
  CreateLeadDto,
  UpdateLeadDto,
  LeadFiltersDto,
  SearchPlacesDto,
  LeadStatusDto,
  NoteDto,
  InteractionDto,
  FollowUpDto,
} from './prospecting.dto.js';
import { PlacesService } from './places.service.js';
import { ProspectingService } from './prospecting.service.js';
class PlaceParams {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{5,2048}$/)
  placeId!: string;
}
class PlaceReferencesDto {
  @ApiProperty({ type: [String], maxItems: 20 })
  @IsArray()
  @ArrayMaxSize(20)
  @Matches(/^[A-Za-z0-9_-]{5,2048}$/, { each: true })
  placeIds!: string[];
}
@ApiTags('Prospecção e CRM')
@ApiCookieAuth()
@Controller('prospecting')
export class ProspectingController {
  constructor(
    private readonly leads: ProspectingService,
    private readonly places: PlacesService,
  ) {}
  @Get('usage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Configuração e consumo técnico Geoapify do administrador atual' })
  usage(@Req() r: AuthRequest) {
    return this.places.usage(r.auth.profile!.id);
  }
  @Get('assignees')
  @ApiOperation({ summary: 'Administradores ativos disponíveis para atribuição' })
  assignees() {
    return this.leads.assignees();
  }
  @Post('places/search')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Busca Geoapify manual por categoria e localidade, com limites' })
  search(@Body() dto: SearchPlacesDto, @Req() r: AuthRequest) {
    return this.places.search(dto, r.auth.profile!.id);
  }
  @Post('places/references')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Sincronizar vínculos CRM de até 20 Place IDs, sem chamar Geoapify' })
  references(@Body() dto: PlaceReferencesDto) {
    return this.leads.references(dto.placeIds);
  }
  @Post('places/:placeId/details')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Detalhes Geoapify sob demanda, limitados à franquia',
  })
  details(@Param() p: PlaceParams, @Req() r: AuthRequest) {
    return this.places.details(p.placeId, r.auth.profile!.id);
  }
  @Get('leads')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Listar leads próprios, com filtros e paginação de 30 registros' })
  list(@Query() dto: LeadFiltersDto) {
    return this.leads.list(dto);
  }
  @Post('leads')
  @ApiOperation({
    summary:
      'Cadastrar lead manual ou referência Place ID única; preservar referências de provedores',
  })
  create(@Body() dto: CreateLeadDto, @Req() r: AuthRequest) {
    return this.leads.create(dto, r.auth.profile!.id);
  }
  @Get('leads/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Lead, histórico recente e acompanhamentos' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.get(id);
  }
  @Patch('leads/:id')
  @ApiOperation({ summary: 'Editar dados comerciais próprios e atribuir responsável ativo' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @Req() r: AuthRequest,
  ) {
    return this.leads.update(id, dto, r.auth.profile!.id);
  }
  @Patch('leads/:id/status')
  @ApiOperation({ summary: 'Alterar status com histórico e auditoria; WON não cria contrato' })
  status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeadStatusDto,
    @Req() r: AuthRequest,
  ) {
    return this.leads.status(id, dto, r.auth.profile!.id);
  }
  @Post('leads/:id/notes')
  @ApiOperation({ summary: 'Registrar nota comercial própria' })
  note(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto, @Req() r: AuthRequest) {
    return this.leads.event(id, dto, r.auth.profile!.id, 'NOTE');
  }
  @Post('leads/:id/interactions')
  @ApiOperation({ summary: 'Registrar contato e atualizar data do último contato' })
  interaction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InteractionDto,
    @Req() r: AuthRequest,
  ) {
    return this.leads.event(id, dto, r.auth.profile!.id, 'INTERACTION');
  }
  @Post('leads/:id/follow-ups')
  @ApiOperation({ summary: 'Agendar próxima ação comercial' })
  follow(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FollowUpDto, @Req() r: AuthRequest) {
    return this.leads.followUp(id, dto, r.auth.profile!.id);
  }
  @Patch('leads/:id/follow-ups/:followUpId/complete')
  @ApiOperation({ summary: 'Concluir acompanhamento do lead' })
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('followUpId', ParseUUIDPipe) followUpId: string,
    @Req() r: AuthRequest,
  ) {
    return this.leads.completeFollowUp(id, followUpId, r.auth.profile!.id);
  }
}
@Module({ controllers: [ProspectingController], providers: [ProspectingService, PlacesService] })
export class ProspectingModule {}
