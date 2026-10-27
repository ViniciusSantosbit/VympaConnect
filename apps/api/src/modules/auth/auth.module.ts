import { Module, Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { SupabaseIdentityService } from './supabase-identity.service.js';
import { JwtSessionGuard, RolesGuard } from './auth.guards.js';
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  canActivate(context: ExecutionContext) {
    this.auth.assertCsrf(context.switchToHttp().getRequest());
    return true;
  }
}
@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseIdentityService, JwtSessionGuard, RolesGuard, CsrfGuard],
  exports: [AuthService, SupabaseIdentityService, JwtSessionGuard, RolesGuard, CsrfGuard],
})
export class AuthModule {}
