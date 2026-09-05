import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ModifierGroupsService } from './modifier-groups.service';
import { UpsertModifierGroupDto } from './dto/upsert-modifier-group.dto';

// 结构性菜单配置，权限跟 dishes/categories 的增删改一致：manager-only（见 menu.controller.ts）
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager')
@Controller('modifier-groups')
export class ModifierGroupsController {
  constructor(private readonly modifierGroupsService: ModifierGroupsService) {}

  @Get()
  list() {
    return this.modifierGroupsService.list();
  }

  @Post()
  create(@Body() dto: UpsertModifierGroupDto) {
    return this.modifierGroupsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertModifierGroupDto) {
    return this.modifierGroupsService.update(id, dto);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.modifierGroupsService.delete(id);
  }
}
