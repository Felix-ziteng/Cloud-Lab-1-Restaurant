import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { StoreConfigService } from './store-config.service';
import { UpdateStoreConfigDto } from './dto/update-store-config.dto';

@Controller('store-config')
export class StoreConfigController {
  constructor(private readonly storeConfigService: StoreConfigService) {}

  // 不设权限：前台/厨房/顾客端启动时都要读它来决定展示哪些功能，内容本身不敏感
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
}
