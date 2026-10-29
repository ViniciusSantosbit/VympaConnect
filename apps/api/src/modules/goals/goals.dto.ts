import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { goalMetricDefinitions, goalStatuses, leadSegments } from '@vympa/shared';
const Optional = () => ValidateIf((_o, v) => v !== undefined);
const numeric = /^\d{1,13}(\.\d{1,4})?$/;
export class GoalDto {
  @ApiProperty({ type: String, format: 'uuid' }) @IsUUID() requestKey!: string;
  @ApiProperty()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(2)
  @MaxLength(180)
  title!: string;
  @ApiProperty({ required: false }) @Optional() @IsString() @MaxLength(3000) description?: string;
  @ApiProperty({ enum: ['COMMERCIAL', 'FINANCIAL', 'TEAM'] })
  @IsIn(['COMMERCIAL', 'FINANCIAL', 'TEAM'])
  category!: string;
  @ApiProperty({ enum: goalMetricDefinitions.map((m) => m.code) })
  @IsIn(goalMetricDefinitions.map((m) => m.code))
  metric!: string;
  @ApiProperty({ enum: ['AUTO', 'MANUAL'] }) @IsIn(['AUTO', 'MANUAL']) mode!: string;
  @ApiProperty({ enum: ['GROWTH', 'LIMIT', 'REDUCTION'] })
  @IsIn(['GROWTH', 'LIMIT', 'REDUCTION'])
  direction!: string;
  @ApiProperty({ description: 'Valor exato em string; dinheiro em centavos.' })
  @IsString()
  @Matches(numeric)
  target!: string;
  @ApiProperty({ required: false }) @Optional() @IsString() @Matches(numeric) baseline?: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn!: string;
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] })
  @IsIn(['LOW', 'MEDIUM', 'HIGH'])
  priority!: string;
  @ApiProperty({ enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'] })
  @IsIn(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'])
  periodicity!: string;
  @ApiProperty({ required: false, enum: leadSegments })
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsIn(leadSegments)
  segment?: (typeof leadSegments)[number] | null;
  @ApiProperty({ enum: ['COMPANY', 'ASSIGNED'] }) @IsIn(['COMPANY', 'ASSIGNED']) scope!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  assigneeIds!: string[];
  @ApiProperty() @IsBoolean() adminVisible!: boolean;
  @ApiProperty() @IsBoolean() allowManualUpdates!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(90) alertDays!: number;
  @ApiProperty({ required: false }) @Optional() @IsString() @MaxLength(3000) notes?: string;
}
export class EditGoalDto extends PartialType(GoalDto, { skipNullProperties: false }) {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(3000)
  reason!: string;
}
export class GoalActionDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(3000)
  reason!: string;
}
export class ManualGoalDto extends GoalActionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() requestKey!: string;
  @ApiProperty({ description: 'Valor realizado absoluto, não incremento.' })
  @IsString()
  @Matches(numeric)
  value!: string;
  @ApiProperty({ format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) observedOn!: string;
}
export class GoalCommentDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(3000)
  body!: string;
}
export class GoalBlockerDto extends GoalActionDto {
  @ApiProperty() @IsBoolean() blocked!: boolean;
}
export class GoalFiltersDto {
  @ApiProperty({ required: false, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;
  @ApiProperty({ required: false }) @Optional() @IsString() @MaxLength(180) query?: string;
  @ApiProperty({ required: false, enum: ['COMMERCIAL', 'FINANCIAL', 'TEAM'] })
  @Optional()
  @IsIn(['COMMERCIAL', 'FINANCIAL', 'TEAM'])
  category?: string;
  @ApiProperty({ required: false, enum: goalMetricDefinitions.map((m) => m.code) })
  @Optional()
  @IsIn(goalMetricDefinitions.map((m) => m.code))
  metric?: string;
  @ApiProperty({ required: false, enum: goalStatuses })
  @Optional()
  @IsIn(goalStatuses)
  status?: string;
  @ApiProperty({ required: false, enum: leadSegments })
  @Optional()
  @IsIn(leadSegments)
  segment?: (typeof leadSegments)[number];
  @ApiProperty({ required: false }) @Optional() @IsUUID() responsibleId?: string;
  @ApiProperty({ required: false }) @Optional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn?: string;
  @ApiProperty({ required: false }) @Optional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn?: string;
  @ApiProperty({ required: false }) @Optional() @Matches(/^\d{4}-\d{2}-\d{2}$/) asOf?: string;
}
