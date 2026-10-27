import { Controller, Get, Post, Body, Req, Res, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { Public, Onboarding } from './auth.guards.js';
import { LoginDto, EmailDto, PasswordDto, VerifyMfaDto, ConfirmEmailDto } from './auth.dto.js';
import type { AuthRequest } from './auth.types.js';

@Controller('auth')
@Throttle({ default: { limit: 15, ttl: 60000 } })
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Get('csrf')
  @Public()
  @Header('Cache-Control', 'no-store')
  csrf(@Res({ passthrough: true }) response: Response, @Req() request: Request) {
    return this.auth.csrf(response, request);
  }
  @Post('login')
  @Public()
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto.email, dto.password, response, request);
  }
  @Post('logout')
  @Public()
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.logout(request, response);
  }
  @Post('recover')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  recover(@Body() dto: EmailDto) {
    return this.auth.recover(dto.email);
  }
  @Post('confirm')
  @Public()
  confirm(
    @Body() dto: ConfirmEmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.confirm(dto.tokenHash, dto.type, response, request);
  }
  @Get('session')
  @Onboarding()
  session(@Req() request: AuthRequest) {
    return this.auth.state(request.auth);
  }
  @Get('me')
  me(@Req() request: AuthRequest) {
    const p = request.auth.profile!;
    return {
      id: p.id,
      email: p.email,
      role: p.role,
      active: p.active,
      aal: request.auth.identity.aal,
    };
  }
  @Post('mfa/enroll')
  @Onboarding()
  enroll(@Req() request: AuthRequest) {
    return this.auth.enroll(request.auth);
  }
  @Post('mfa/verify')
  @Onboarding()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  verify(@Body() dto: VerifyMfaDto, @Req() request: AuthRequest) {
    return this.auth.verifyMfa(request.auth, dto.factorId, dto.code);
  }
  @Post('password')
  @Onboarding()
  password(@Body() dto: PasswordDto, @Req() request: AuthRequest) {
    return this.auth.password(request.auth, dto.password);
  }
  @Post('invitation/accept')
  @Onboarding()
  accept(@Req() request: AuthRequest) {
    return this.auth.accept(request.auth);
  }
  @Post('mfa/recovery')
  @Onboarding()
  @Throttle({ default: { limit: 2, ttl: 3600000 } })
  recovery(@Req() request: AuthRequest) {
    return this.auth.requestMfaRecovery(request.auth);
  }
}
