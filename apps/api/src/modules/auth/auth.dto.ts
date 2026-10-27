import { IsEmail, IsString, MinLength, MaxLength, IsUUID, Matches, IsIn } from 'class-validator';
export class LoginDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) @MaxLength(1024) password!: string;
}
export class EmailDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class PasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class VerifyMfaDto {
  @IsUUID() factorId!: string;
  @Matches(/^\d{6}$/) code!: string;
}
export class ConfirmEmailDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,2048}$/) tokenHash!: string;
  @IsIn(['invite', 'recovery']) type!: 'invite' | 'recovery';
}
