import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StoreConfigService } from './store-config.service';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';
import { VerifyTabletPasscodeDto } from './dto/verify-tablet-passcode.dto';

@Controller('store-config')
export class StoreConfigController {
  constructor(private readonly storeConfigService: StoreConfigService) {}

  // 不设权限：前台/厨房/顾客端启动时都要读它来决定展示哪些功能，内容本身不敏感
  // （service 层已经把 tabletOpenPasscodeHash 摘掉了，这里不用再处理一遍）
  @Get()
  get() {
    return this.storeConfigService.get();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Patch()
  update(@Body() dto: UpdateStoreConfigDto) {
    return this.storeConfigService.update(dto);
  }

  // 不设权限：桌台平板选桌开台前，靠这个校验它自己的开台密码（全店统一、只是挡客人，
  // 不是真安全边界，见 tables 模块的 tablet-open 端点）
  @Post('verify-tablet-passcode')
  async verifyTabletPasscode(@Body() dto: VerifyTabletPasscodeDto) {
    const valid = await this.storeConfigService.verifyTabletPasscode(dto.passcode);
    return { valid };
  }
}
