import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsIn,
  IsUUID,
  IsEmail,
  IsISO8601,
  IsInt,
  Min,
  Max,
  IsNumber,
  Matches,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { leadStatuses, leadSegments, brazilStates } from '@vympa/shared';
import type { LeadStatus, LeadSegment } from '@vympa/shared';
export class LeadFiltersDto {
  @ApiProperty({ type: String, required: false, enum: [...leadSegments] })
  @IsOptional()
  @IsIn(leadSegments)
  segment?: LeadSegment;
  @ApiProperty({ type: String, required: false, enum: [...leadStatuses] })
  @IsOptional()
  @IsIn(leadStatuses)
  status?: LeadStatus;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(brazilStates.map((s) => s[0]))
  state?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'])
  region?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  query?: string;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
}
export class SearchPlacesDto {
  @ApiProperty({ type: String, required: true, enum: [...leadSegments] })
  @IsIn(leadSegments)
  segment!: LeadSegment;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(brazilStates.map((s) => s[0]))
  state?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'])
  region?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  query?: string;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  minRating?: number;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pageToken?: string;
}
export class CreateLeadDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{5,255}$/)
  placeId?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  companyName?: string;
  @ApiProperty({ type: String, required: true, enum: [...leadSegments] })
  @IsIn(leadSegments)
  segment!: LeadSegment;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(brazilStates.map((s) => s[0]))
  state?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'])
  region?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
export class UpdateLeadDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(180)
  companyName?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  contactChannel?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nextAction?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}
export class LeadStatusDto {
  @ApiProperty({ type: String, required: true, enum: [...leadStatuses] })
  @IsIn(leadStatuses)
  status!: LeadStatus;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observation?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lossReason?: string;
}
export class NoteDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}
export class InteractionDto extends NoteDto {
  @ApiProperty({ type: String, required: true })
  @IsIn(['PHONE', 'EMAIL', 'WHATSAPP', 'MEETING', 'OTHER'])
  channel!: string;
}
export class FollowUpDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  action!: string;
  @ApiProperty({ type: String, required: true })
  @IsISO8601({ strict: true })
  dueAt!: string;
}
