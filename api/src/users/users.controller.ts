import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { SessionUser } from '../common/types/session-user';
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Roles(Role.OWNER)
  @Get()
  list(@Query() q: ListUsersQueryDto) {
    return this.svc.list(q);
  }

  @Roles(Role.OWNER)
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.svc.create(dto);
  }

  @Roles(Role.OWNER)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() actor: SessionUser,
    @Body() dto: UpdateUserDto,
  ) {
    return this.svc.update(id, actor.id, dto);
  }

  @Roles(Role.OWNER)
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  disable(@Param('id') id: string, @CurrentUser() actor: SessionUser) {
    return this.svc.disable(id, actor.id);
  }

  @Roles(Role.OWNER)
  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  enable(@Param('id') id: string) {
    return this.svc.enable(id);
  }

  @Roles(Role.OWNER)
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id') id: string) {
    return this.svc.resetPassword(id);
  }
}
