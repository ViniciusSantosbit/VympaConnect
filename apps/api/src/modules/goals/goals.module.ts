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
import { goalMetricDefinitions } from '@vympa/shared';
import { Roles } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { FinanceConstraintFilter } from '../finance/finance-constraint.filter.js';
import { GoalMetricsService } from './goal-metrics.service.js';
import { GoalProgressService } from './goal-progress.service.js';
import { GoalAnalyticsService } from './goal-analytics.service.js';
import { GoalsService } from './goals.service.js';
import {
  GoalDto,
  EditGoalDto,
  GoalActionDto,
  GoalBlockerDto,
  GoalCommentDto,
  GoalFiltersDto,
  ManualGoalDto,
} from './goals.dto.js';
const p = (r: AuthRequest) => r.auth.profile!;
@ApiTags('Central de Metas')
@ApiCookieAuth()
@UseFilters(FinanceConstraintFilter)
@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goals: GoalsService,
    private readonly analytics: GoalAnalyticsService,
  ) {}
  @Get('definitions') @Header('Cache-Control', 'no-store') definitions(@Req() r: AuthRequest) {
    return goalMetricDefinitions.filter((m) => p(r).role === 'OWNER' || !m.financial);
  }
  @Get('summary') @Header('Cache-Control', 'no-store') summary(@Req() r: AuthRequest) {
    return this.goals.summary(p(r).id, p(r).role);
  }
  @Get('analytics') @Roles('OWNER') @Header('Cache-Control', 'no-store') analyze(
    @Query() q: GoalFiltersDto,
  ) {
    return this.analytics.analytics(q);
  }
  @Get('team') @Header('Cache-Control', 'no-store') team(
    @Query() q: GoalFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.analytics.team(q, p(r).id, p(r).role);
  }
  @Get() @Header('Cache-Control', 'no-store') list(
    @Query() q: GoalFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.list(q, p(r).id, p(r).role);
  }
  @Post()
  @Roles('OWNER')
  @ApiOperation({ summary: 'Configurar meta com valores exatos e responsabilidades explícitas' })
  create(@Body() d: GoalDto, @Req() r: AuthRequest) {
    return this.goals.create(d, p(r).id, p(r).role);
  }
  @Get(':id') @Header('Cache-Control', 'no-store') get(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: GoalFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.get(id, p(r).id, p(r).role, q.asOf);
  }
  @Patch(':id') @Roles('OWNER') edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: EditGoalDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.edit(id, d, p(r).id, p(r).role);
  }
  @Get(':id/progress') @Header('Cache-Control', 'no-store') async progress(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: GoalFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return (await this.goals.get(id, p(r).id, p(r).role, q.asOf)).progress;
  }
  @Get(':id/history') @Header('Cache-Control', 'no-store') history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: GoalFiltersDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.history(id, p(r).id, p(r).role, q.page);
  }
  @Post(':id/manual-updates') manual(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: ManualGoalDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.manual(id, d, p(r).id, p(r).role);
  }
  @Post(':id/comments') comment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: GoalCommentDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.comment(id, d.body, p(r).id, p(r).role);
  }
  @Post(':id/blockers') blocker(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: GoalBlockerDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.action(id, d, p(r).id, p(r).role);
  }
  @Post(':id/cancel') @Roles('OWNER') cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: GoalActionDto,
    @Req() r: AuthRequest,
  ) {
    return this.goals.action(id, d, p(r).id, p(r).role, true);
  }
  @Post(':id/snapshots') snapshot(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.goals.snapshot(id, p(r).id, p(r).role);
  }
}
@Module({
  controllers: [GoalsController],
  providers: [GoalsService, GoalMetricsService, GoalProgressService, GoalAnalyticsService],
  exports: [GoalsService, GoalMetricsService, GoalProgressService],
})
export class GoalsModule {}
