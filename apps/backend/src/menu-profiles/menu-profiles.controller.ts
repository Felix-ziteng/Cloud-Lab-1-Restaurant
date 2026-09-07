import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuProfilesService } from './menu-profiles.service';
import { UpsertMenuProfileDto } from './dto/upsert-menu-profile.dto';
import { SetMenuProfileOverrideDto } from './dto/set-menu-profile-override.dto';

@Controller('menu-profiles')
export class MenuProfilesController {
  constructor(private readonly menuProfilesService: MenuProfilesService) {}

  // 完整列表——管理界面（manager）建/改版本要用，前台手动切换下拉（任意店员）也要用来
  // 列出可选的版本，所以只要求登录、不限制角色（创建/修改/删除这些结构性改动才要 manager）
  @UseGuards(JwtAuthGuard)
  @Get()
  list() {
    return this.menuProfilesService.list();
  }

  // 不鉴权：前台指示器、GET /menu 内部过滤逻辑都要读，信息本身不敏感（跟 GET /menu 同级别）
  @Get('active')
  active() {
    return this.menuProfilesService.resolveActive();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post()
  create(@Body() dto: UpsertMenuProfileDto) {
    return this.menuProfilesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpsertMenuProfileDto) {
    return this.menuProfilesService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.menuProfilesService.delete(id);
  }

  // 前台"临时切换菜单版本/恢复自动"用：任意登录店员都能操作，不要求 manager——
  // 定义版本是结构性配置要 manager，当天临时切一下不需要（跟开台密码那次的权限分层原则一致）
  @UseGuards(JwtAuthGuard)
  @Post('override')
  setOverride(@Body() dto: SetMenuProfileOverrideDto) {
    return this.menuProfilesService.setOverride(dto.profileId);
  }
}
