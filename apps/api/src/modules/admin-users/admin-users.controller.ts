import { Controller, Get, Post, Patch, Body, Param, Req, ParseUUIDPipe } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service.js';
import { Roles } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.types.js';
import { InvitationDto, StatusDto, RoleDto } from './admin-users.dto.js';
@Controller('admin')
@Roles('OWNER')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get('users') list() {
    return this.users.list();
  }
  @Get('invitations') invitations() {
    return this.users.invitations();
  }
  @Post('invitations') invite(@Body() dto: InvitationDto, @Req() request: AuthRequest) {
    return this.users.invite(request.auth.profile!.id, dto.email);
  }
  @Patch('invitations/:id/revoke') revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthRequest,
  ) {
    return this.users.revoke(request.auth.profile!.id, id);
  }
  @Patch('users/:id/status') status(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StatusDto,
    @Req() request: AuthRequest,
  ) {
    return this.users.change(request.auth.profile!.id, id, { active: dto.active });
  }
  @Patch('users/:id/role') role(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RoleDto,
    @Req() request: AuthRequest,
  ) {
    return this.users.change(request.auth.profile!.id, id, { role: dto.role });
  }
  @Get('mfa-recovery') recovery() {
    return this.users.recoveryRequests();
  }
  @Patch('mfa-recovery/:id/approve') approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthRequest,
  ) {
    return this.users.approveRecovery(request.auth.profile!.id, id);
  }
}
