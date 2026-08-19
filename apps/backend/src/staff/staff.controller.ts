import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { ResetPinDto } from './dto/reset-pin.dto';

// 员工账号管理全部仅限 manager：新店员/店长上岗、重置 PIN、停用离职员工。
// 第一个 manager 账号仍然来自种子脚本（见 prisma/seed.ts）——这里管理的是"之后"的员工。
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('manager')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  list() {
    return this.staffService.list();
  }

  @Post()
  create(@Body() dto: CreateStaffDto) {
    return this.staffService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staffService.update(id, dto);
  }

  @Patch(':id/pin')
  resetPin(@Param('id') id: string, @Body() dto: ResetPinDto) {
    return this.staffService.resetPin(id, dto.pin);
  }
}
