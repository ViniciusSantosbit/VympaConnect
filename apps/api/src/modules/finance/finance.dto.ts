import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { leadSegments, moneyLimit, offeringCodes } from '@vympa/shared';
export class VersionDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) version!: number;
}
export class OfferingDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(180) name!: string;
  @ApiProperty({ type: String }) @IsString() @MaxLength(3000) description!: string;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  baseCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  setupCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  monthlyCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  operatingCents?: number | null;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}
export class DiscountPointDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(moneyLimit) atCents!: number;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10000) discountBps!: number;
}
export class PolicyDto extends VersionDto {
  @ApiProperty({ type: [DiscountPointDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DiscountPointDto)
  rules!: DiscountPointDto[];
  @ApiProperty({ type: Boolean }) @IsBoolean() provisional!: boolean;
}
export class SimulationDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(moneyLimit) currentCostCents!: number;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(offeringCodes, { each: true })
  offeringCodes!: string[];
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(moneyLimit) setupCents!: number;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  infrastructureCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  aiCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  maintenanceCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  supportCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  otherCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000000)
  developmentMinutes?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  hourlyCents?: number | null;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  manualDiscountBps?: number;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(moneyLimit)
  manualMonthlyCents?: number;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  exceptionReason?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bundleScope?: string;
}
export class ProposalDto extends SimulationDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(180) companyName!: string;
  @ApiProperty({ type: String }) @IsIn(leadSegments) segment!:
    'ADVOCACIA' | 'CONTABILIDADE' | 'IMOBILIARIO';
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsUUID() leadId?: string | null;
  @ApiProperty({ type: String }) @IsUUID() responsibleId!: string;
  @ApiProperty({ type: String })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  simulationDate!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  currentSystem?: string;
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  systemCount?: number;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  systemNotes?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  problems?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  requirements?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
  @ApiProperty({ type: Number, required: false }) @IsOptional() @IsInt() @Min(1) version?: number;
}
export class ProposalStateDto extends VersionDto {
  @ApiProperty({ type: String })
  @IsIn(['PREPARED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'])
  status!: 'PREPARED' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
}
export class CategoryDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @ApiProperty({ type: String }) @IsIn(['GENERAL', 'AI', 'INFRA', 'INVESTMENT']) group!:
    'GENERAL' | 'AI' | 'INFRA' | 'INVESTMENT';
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
}
export class PeriodDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^(20\d{2})-(0[1-9]|1[0-2])$/)
  period?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsUUID() categoryId?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsIn(['INCOME', 'EXPENSE']) type?:
    'INCOME' | 'EXPENSE';
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsIn(['PLANNED', 'PENDING', 'SETTLED', 'CANCELLED'])
  status?: 'PLANNED' | 'PENDING' | 'SETTLED' | 'CANCELLED';
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsIn(['CASH', 'ACCRUAL']) basis?:
    'CASH' | 'ACCRUAL';
  @ApiProperty({ type: Number, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
}
export class EntryDto {
  @ApiProperty({ type: String }) @IsUUID() requestKey!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(250) description!: string;
  @ApiProperty({ type: String }) @IsIn(['INCOME', 'EXPENSE']) type!: 'INCOME' | 'EXPENSE';
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(moneyLimit) amountCents!: number;
  @ApiProperty({ type: String })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  competenceOn!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  dueOn?: string | null;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  settledOn?: string | null;
  @ApiProperty({ type: String }) @IsIn(['PLANNED', 'PENDING', 'SETTLED', 'CANCELLED']) status!:
    'PLANNED' | 'PENDING' | 'SETTLED' | 'CANCELLED';
  @ApiProperty({ type: String }) @IsUUID() categoryId!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  counterparty?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  serviceReference?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
  @ApiProperty({ type: Number, required: false }) @IsOptional() @IsInt() @Min(1) version?: number;
}
export class OpeningDto extends VersionDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(-moneyLimit) @Max(moneyLimit) amountCents!: number;
  @ApiProperty({ type: String })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  effectiveOn!: string;
}
export class RecurringDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(250) description!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(moneyLimit) amountCents!: number;
  @ApiProperty({ type: String }) @IsUUID() categoryId!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(31) dueDay!: number;
  @ApiProperty({ type: String })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  startsOn!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  endsOn?: string | null;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  supplier?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
}
export class InvestmentDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(180) name!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(moneyLimit) estimatedCents!: number;
  @ApiProperty({ type: String }) @IsIn(['LOW', 'MEDIUM', 'HIGH']) priority!:
    'LOW' | 'MEDIUM' | 'HIGH';
  @ApiProperty({ type: String }) @IsIn(['PLANNED', 'APPROVED', 'CANCELLED']) status!:
    'PLANNED' | 'APPROVED' | 'CANCELLED';
  @ApiProperty({ type: String })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  plannedOn!: string;
  @ApiProperty({ type: String }) @IsUUID() categoryId!: string;
  @ApiProperty({ type: String }) @IsUUID() responsibleId!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
}
export class PayInvestmentDto extends VersionDto {
  @ApiProperty({ type: String }) @IsUUID() requestKey!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(moneyLimit) amountCents!: number;
  @ApiProperty({ type: String })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  settledOn!: string;
}
export class AiCostDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @MinLength(2) @MaxLength(100) provider!: string;
  @ApiProperty({ type: String }) @IsString() @MinLength(1) @MaxLength(180) modelService!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(moneyLimit) amountCents!: number;
  @ApiProperty({ type: String }) @Matches(/^(20\d{2})-(0[1-9]|1[0-2])$/) period!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  projectReference?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  unit?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,6})?$/)
  @MaxLength(80)
  quantity?: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  notes?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsUUID() transactionId?:
    string | null;
}
