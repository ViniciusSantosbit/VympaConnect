import { FinanceConstraintFilter } from './finance-constraint.filter.js';
import {
  UseFilters,
  Body,
  Controller,
  Get,
  Header,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Roles } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { SimulatorService } from './simulator.service.js';
import { ManagementService } from './management.service.js';
import {
  AiCostDto,
  CategoryDto,
  EntryDto,
  InvestmentDto,
  OfferingDto,
  OpeningDto,
  PayInvestmentDto,
  PeriodDto,
  PolicyDto,
  ProposalDto,
  ProposalStateDto,
  RecurringDto,
  SimulationDto,
} from './finance.dto.js';
class GeneratePeriodDto {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  period!: string;
}
@UseFilters(FinanceConstraintFilter)
@ApiTags('Simulador comercial')
@ApiCookieAuth()
@Controller('finance')
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}
  @Get('catalog')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Catálogo comercial; preços indefinidos permanecem nulos' })
  catalog() {
    return this.simulator.catalog();
  }
  @Put('catalog/:code')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Alterar preço oficial com versão e auditoria' })
  offering(@Param('code') code: string, @Body() dto: OfferingDto, @Req() r: AuthRequest) {
    return this.simulator.saveOffering(code, dto, r.auth.profile!.id);
  }
  @Get('discount-policy') @Header('Cache-Control', 'no-store') policy() {
    return this.simulator.policy();
  }
  @Put('discount-policy') @Roles('OWNER') policySave(
    @Body() dto: PolicyDto,
    @Req() r: AuthRequest,
  ) {
    return this.simulator.savePolicy(dto, r.auth.profile!.id);
  }
  @Post('simulations/calculate')
  @ApiOperation({ summary: 'Recalcular no servidor; exceções comerciais somente OWNER' })
  calculate(@Body() dto: SimulationDto, @Req() r: AuthRequest) {
    return this.simulator.calculate(dto, r.auth.profile!.role);
  }
  @Get('simulations') @Header('Cache-Control', 'no-store') list(@Query() q: PeriodDto) {
    return this.simulator.list(q.page);
  }
  @Post('simulations') save(@Body() dto: ProposalDto, @Req() r: AuthRequest) {
    return this.simulator.save(dto, r.auth.profile!.id, r.auth.profile!.role);
  }
  @Get('simulations/:id') @Header('Cache-Control', 'no-store') get(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.simulator.get(id);
  }
  @Put('simulations/:id') edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposalDto,
    @Req() r: AuthRequest,
  ) {
    return this.simulator.save(dto, r.auth.profile!.id, r.auth.profile!.role, id);
  }
  @Post('simulations/:id/duplicate') duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() r: AuthRequest,
  ) {
    return this.simulator.duplicate(id, r.auth.profile!.id, r.auth.profile!.role);
  }
  @Post('simulations/:id/status') state(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ProposalStateDto,
    @Req() r: AuthRequest,
  ) {
    return this.simulator.state(id, dto, r.auth.profile!.id);
  }
}
@UseFilters(FinanceConstraintFilter)
@ApiTags('Gestão financeira privada')
@ApiCookieAuth()
@Roles('OWNER')
@Controller('finance/management')
export class ManagementController {
  constructor(private readonly finance: ManagementService) {}
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Caixa realizado e previsão separados, sem contabilizar propostas' })
  summary(@Query() q: PeriodDto) {
    return this.finance.summary(q);
  }
  @Get('reports') @Header('Cache-Control', 'no-store') reports(@Query() q: PeriodDto) {
    return this.finance.summary(q);
  }
  @Get('transactions') @Header('Cache-Control', 'no-store') entries(@Query() q: PeriodDto) {
    return this.finance.entries(q);
  }
  @Post('transactions') entry(@Body() dto: EntryDto, @Req() r: AuthRequest) {
    return this.finance.saveEntry(dto, r.auth.profile!.id);
  }
  @Put('transactions/:id') entryEdit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EntryDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.saveEntry(dto, r.auth.profile!.id, id);
  }
  @Get('categories') categories() {
    return this.finance.categories();
  }
  @Post('categories') category(@Body() dto: CategoryDto, @Req() r: AuthRequest) {
    return this.finance.category(dto, r.auth.profile!.id);
  }
  @Put('categories/:id') categoryEdit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CategoryDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.category(dto, r.auth.profile!.id, id);
  }
  @Get('opening-balance') opening() {
    return this.finance.opening();
  }
  @Put('opening-balance') openingSave(@Body() dto: OpeningDto, @Req() r: AuthRequest) {
    return this.finance.saveOpening(dto, r.auth.profile!.id);
  }
  @Get('recurring') recurring() {
    return this.finance.recurring();
  }
  @Post('recurring') recurringSave(@Body() dto: RecurringDto, @Req() r: AuthRequest) {
    return this.finance.saveRecurring(dto, r.auth.profile!.id);
  }
  @Put('recurring/:id') recurringEdit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecurringDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.saveRecurring(dto, r.auth.profile!.id, id);
  }
  @Post('recurring/:id/generate') generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GeneratePeriodDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.generateRecurring(id, dto.period, r.auth.profile!.id);
  }
  @Get('investments') investments() {
    return this.finance.investments();
  }
  @Post('investments') investment(@Body() dto: InvestmentDto, @Req() r: AuthRequest) {
    return this.finance.saveInvestment(dto, r.auth.profile!.id);
  }
  @Put('investments/:id') investmentEdit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InvestmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.saveInvestment(dto, r.auth.profile!.id, id);
  }
  @Post('investments/:id/pay') investmentPay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayInvestmentDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.payInvestment(id, dto, r.auth.profile!.id);
  }
  @Get('ai-costs') ai(@Query() q: PeriodDto) {
    return this.finance.aiCosts(q.period);
  }
  @Post('ai-costs') aiSave(@Body() dto: AiCostDto, @Req() r: AuthRequest) {
    return this.finance.saveAi(dto, r.auth.profile!.id);
  }
  @Put('ai-costs/:id') aiEdit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AiCostDto,
    @Req() r: AuthRequest,
  ) {
    return this.finance.saveAi(dto, r.auth.profile!.id, id);
  }
  @Get('audit') @Header('Cache-Control', 'no-store') audits() {
    return this.finance.audits();
  }
}
@Module({
  controllers: [SimulatorController, ManagementController],
  providers: [SimulatorService, ManagementService],
  exports: [ManagementService, SimulatorService],
})
export class FinanceModule {}
