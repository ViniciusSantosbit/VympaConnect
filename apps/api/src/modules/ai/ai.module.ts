import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AuthRequest } from '../auth/auth.types.js';
import { ProspectingModule } from '../prospecting/prospecting.module.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { GoalsModule } from '../goals/goals.module.js';
import { AiToolsService } from './ai-tools.service.js';
import { AiService } from './ai.service.js';
import { GeminiService } from './gemini.service.js';
class PageDto {
  @ApiProperty({ required: false, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page = 1;
}
class NewConversationDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(120) title?: string;
}
export class AskAiDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestKey!: string;
  @ApiProperty({ maxLength: 2000 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  question!: string;
}
const actor = (r: AuthRequest) => ({ id: r.auth.profile!.id, role: r.auth.profile!.role });
@ApiTags('VYMPA AI consultiva')
@ApiCookieAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly gemini: GeminiService,
  ) {}
  @Get('status') @Header('Cache-Control', 'no-store') status() {
    return this.gemini.status();
  }
  @Get('conversations') @Header('Cache-Control', 'no-store') list(
    @Query() q: PageDto,
    @Req() r: AuthRequest,
  ) {
    return this.ai.list(actor(r), q.page);
  }
  @Post('conversations') @Throttle({ default: { limit: 10, ttl: 60000 } }) create(
    @Body() d: NewConversationDto,
    @Req() r: AuthRequest,
  ) {
    return this.ai.create(actor(r), d.title);
  }
  @Delete('conversations/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() r: AuthRequest) {
    return this.ai.remove(id, actor(r));
  }
  @Get('conversations/:id/messages') @Header('Cache-Control', 'no-store') messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: PageDto,
    @Req() r: AuthRequest,
  ) {
    return this.ai.messages(id, actor(r), q.page);
  }
  @Post('conversations/:id/messages') @Throttle({ default: { limit: 6, ttl: 60000 } }) ask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: AskAiDto,
    @Req() r: AuthRequest,
  ) {
    return this.ai.ask(id, actor(r), d.question, d.requestKey);
  }
}
@Module({
  imports: [ProspectingModule, FinanceModule, ClientsModule, GoalsModule],
  controllers: [AiController],
  providers: [AiToolsService, AiService, GeminiService],
})
export class AiModule {}
