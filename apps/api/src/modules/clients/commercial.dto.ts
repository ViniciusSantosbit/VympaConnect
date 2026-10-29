import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsString,
  MinLength,
  MaxLength,
  IsIn as ValidateIn,
  IsUUID as ValidateUUID,
  IsInt as ValidateInt,
  Min,
  Max,
  IsEmail,
  IsUrl,
  Matches as ValidateMatches,
  IsBoolean as ValidateBoolean,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ValidateIf,
} from 'class-validator';
import { leadSegments, offeringCodes, moneyLimit } from '@vympa/shared';
// Keep validation and OpenAPI in sync without accepting null for omitted fields.
const Optional = (): PropertyDecorator => (t, k) => {
  const type = Reflect.getMetadata('design:type', t, k);
  ApiProperty({ required: false, type: type === Array ? [String] : (type ?? String) })(t, k);
  ValidateIf((_o, v) => v !== undefined)(t, k);
};
const IsUUID =
  (...args: Parameters<typeof ValidateUUID>): PropertyDecorator =>
  (t, k) => {
    ApiProperty({ type: String, format: 'uuid' })(t, k);
    ValidateUUID(...args)(t, k);
  };
const IsInt =
  (...args: Parameters<typeof ValidateInt>): PropertyDecorator =>
  (t, k) => {
    ApiProperty({ type: Number })(t, k);
    ValidateInt(...args)(t, k);
  };
const IsIn =
  (...args: Parameters<typeof ValidateIn>): PropertyDecorator =>
  (t, k) => {
    ApiProperty({ type: String, enum: args[0], isArray: args[1]?.each })(t, k);
    ValidateIn(...args)(t, k);
  };
const Matches =
  (pattern: RegExp): PropertyDecorator =>
  (t, k) => {
    ApiProperty({ type: String })(t, k);
    ValidateMatches(pattern)(t, k);
  };
const IsBoolean =
  (...args: Parameters<typeof ValidateBoolean>): PropertyDecorator =>
  (t, k) => {
    ApiProperty({ type: Boolean })(t, k);
    ValidateBoolean(...args)(t, k);
  };
const Text = (max = 3000) => [IsString(), MaxLength(max)];
function StringField(max = 3000): PropertyDecorator {
  return (t, k) => {
    for (const d of Text(max)) d(t, k);
    ApiProperty({ type: String, maxLength: max })(t, k);
  };
}
export const clientStatuses = [
  'PROSPECT',
  'ONBOARDING',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
] as const;
export const contractStatuses = [
  'DRAFT',
  'PENDING_SIGNATURE',
  'SIGNED',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
] as const;
export class CommercialFiltersDto {
  @ApiProperty({ required: false, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @Optional() @StringField(180) query?: string;
  @Optional() @IsIn(leadSegments) segment?: (typeof leadSegments)[number];
  @Optional() @IsIn([...clientStatuses, ...contractStatuses]) status?: string;
  @Optional() @IsUUID() clientId?: string;
  @Optional() @IsUUID() responsibleId?: string;
  @Optional() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) expiresIn?: string;
  @Type(() => Number) @IsInt() @IsIn([7, 15, 30]) days = 30;
}
export class ClientDto {
  @StringField(180)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  companyName!: string;
  @Optional() @StringField(180) tradeName?: string;
  @Optional() @StringField(18) cnpj?: string;
  @ApiProperty({ enum: leadSegments }) @IsIn(leadSegments) segment!: (typeof leadSegments)[number];
  @Optional() @IsEmail() @MaxLength(254) email?: string;
  @Optional() @StringField(40) phone?: string;
  @Optional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  website?: string;
  @Optional() @StringField(500) address?: string;
  @Optional() @StringField(100) city?: string;
  @Optional() @Matches(/^[A-Z]{2}$/) state?: string;
  @Optional() @Matches(/^\d{5}-?\d{3}$/) postalCode?: string;
  @ApiProperty({ type: String }) @IsUUID() responsibleId!: string;
  @Optional() @StringField() notes?: string;
}
export class UpdateClientDto extends PartialType(ClientDto, { skipNullProperties: false }) {
  @IsInt() @Min(1) version!: number;
}
export class ClientStateDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(clientStatuses) status!: (typeof clientStatuses)[number];
  @StringField() @MinLength(5) reason!: string;
}
export class ActivityDto {
  @StringField() @MinLength(2) body!: string;
}
export class ConvertLeadDto {
  @Optional() @IsUUID() clientId?: string;
  @Optional() @StringField(180) companyName?: string;
  @Optional() @StringField(18) cnpj?: string;
  @Optional() @IsUUID() responsibleId?: string;
}
export class ContactDto {
  @StringField(150) @MinLength(2) name!: string;
  @Optional() @StringField(100) position?: string;
  @Optional() @IsEmail() @MaxLength(254) email?: string;
  @Optional() @StringField(40) phone?: string;
  @Optional() @IsIn(['EMAIL', 'PHONE', 'WHATSAPP', 'OTHER']) preferredChannel?: string;
  @Optional() @StringField(1000) notes?: string;
  @IsBoolean() primary = false;
  @Optional() @IsInt() @Min(1) version?: number;
}
export class ClientServiceDto {
  @IsIn(offeringCodes) code!: string;
  @IsIn(['PLANNED', 'IMPLEMENTING', 'LIVE', 'SUSPENDED', 'ENDED']) status!: string;
  @Optional() @StringField(1000) notes?: string;
  @IsInt() @Min(1) version!: number;
}
export class ContractDto {
  @StringField(100) @MinLength(8) requestKey!: string;
  @StringField(60) @Matches(/^[A-Za-z0-9][A-Za-z0-9./_-]{1,59}$/) number!: string;
  @IsUUID() clientId!: string;
  @StringField(180) @MinLength(2) title!: string;
  @Optional() @StringField() description?: string;
  @IsUUID() responsibleId!: string;
  @Optional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn?: string;
  @Optional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn?: string;
  @Optional() @IsInt() @Min(0) @Max(moneyLimit) setupCents?: number;
  @Optional() @IsInt() @Min(0) @Max(moneyLimit) monthlyCents?: number;
  @Optional() @IsIn(['MONTHLY', 'QUARTERLY', 'YEARLY', 'ONCE']) billingPeriod?: string;
  @Optional() @StringField() commercialTerms?: string;
  @Optional() @StringField() adjustmentTerms?: string;
  @Optional() @StringField() notes?: string;
  @Optional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(offeringCodes, { each: true })
  serviceCodes?: string[];
  @Optional() @IsUUID() proposalId?: string;
}
export class UpdateContractDto extends PartialType(ContractDto, { skipNullProperties: false }) {
  @IsInt() @Min(1) version!: number;
}
export class ContractStateDto {
  @IsInt() @Min(1) version!: number;
  @IsIn(contractStatuses) status!: (typeof contractStatuses)[number];
  @StringField() @MinLength(5) reason!: string;
  @Optional() @StringField(1000) signatureEvidence?: string;
}
export class AmendmentDto {
  @IsInt() @Min(1) version!: number;
  @StringField(100) @MinLength(8) requestKey!: string;
  @IsInt() @Min(0) @Max(moneyLimit) monthlyCents!: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) effectiveOn!: string;
  @StringField() @MinLength(5) reason!: string;
  @Optional() @StringField(100) indexName?: string;
  @Optional() @IsInt() @Min(-10000) @Max(100000) percentBps?: number;
  @Optional() @IsUUID() documentId?: string;
}
export class DocumentDto {
  // Reject separators and control characters before any future storage integration.
  // eslint-disable-next-line no-control-regex
  @StringField(180) @MinLength(2) @Matches(/^[^\\/\x00-\x1f]+$/) name!: string;
  @IsIn(['PDF', 'DOCX']) kind!: string;
}
export class RenewalDto {
  @IsInt() @Min(1) version!: number;
  @StringField(100) @MinLength(8) requestKey!: string;
  @StringField(60) @Matches(/^[A-Za-z0-9][A-Za-z0-9./_-]{1,59}$/) number!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn!: string;
  @StringField() @MinLength(5) reason!: string;
}
