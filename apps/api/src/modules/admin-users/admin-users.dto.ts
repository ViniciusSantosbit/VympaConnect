import { IsBoolean, IsEmail, IsEnum, MaxLength } from 'class-validator';
export class InvitationDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class StatusDto {
  @IsBoolean() active!: boolean;
}
export class RoleDto {
  @IsEnum({ OWNER: 'OWNER', ADMIN: 'ADMIN' }) role!: 'OWNER' | 'ADMIN';
}
