import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuService } from './menu.service';
import { UpsertDishDto } from './dto/upsert-dish.dto';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

@Controller()
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // 顾客（桌台会话）和店员共用同一个只读入口，includeUnavailable 由前端按角色决定是否传
  @Get('menu')
  getMenu(@Query('includeUnavailable') includeUnavailable?: string) {
    return this.menuService.getMenu(includeUnavailable === 'true');
  }

  @UseGuards(JwtAuthGuard)
  @Patch('dishes/:id/availability')
  setAvailability(@Param('id') id: string, @Body('isAvailable') isAvailable: boolean) {
    return this.menuService.setAvailability(id, isAvailable);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post('dishes')
  createDish(@Body() dto: UpsertDishDto) {
    return this.menuService.createDish(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Put('dishes/:id')
  updateDish(@Param('id') id: string, @Body() dto: UpsertDishDto) {
    return this.menuService.updateDish(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Delete('dishes/:id')
  deleteDish(@Param('id') id: string) {
    return this.menuService.deleteDish(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post('categories')
  createCategory(@Body() dto: UpsertCategoryDto) {
    return this.menuService.createCategory(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Put('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpsertCategoryDto) {
    return this.menuService.updateCategory(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.menuService.deleteCategory(id);
  }
}
