import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service.js';
import type { AuthRequest } from './auth.types.js';
export const Public = () => SetMetadata('auth:public', true);
export const Onboarding = () => SetMetadata('auth:onboarding', true);
export const Roles = (...roles: ('OWNER' | 'ADMIN')[]) => SetMetadata('auth:roles', roles);

@Injectable()
export class JwtSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('auth:public', targets)) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    request.auth = await this.auth.authenticate(request);
    if (!this.reflector.getAllAndOverride<boolean>('auth:onboarding', targets)) {
      if (request.auth.recovery || request.auth.identity.aal !== 'aal2')
        throw new ForbiddenException('MFA_REQUIRED');
      if (!request.auth.profile?.active || !['OWNER', 'ADMIN'].includes(request.auth.profile.role))
        throw new ForbiddenException('Acesso administrativo não autorizado.');
    }
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<string[]>('auth:roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.auth?.profile || !roles.includes(request.auth.profile.role))
      throw new ForbiddenException('Papel administrativo insuficiente.');
    return true;
  }
}
