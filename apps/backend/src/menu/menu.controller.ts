import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MenuService } from './menu.service';
import { UpsertDishDto } from './dto/upsert-dish.dto';
import { UpsertCategoryDto } from './dto/upsert-category.dto';

// 菜品图片存本地磁盘，不引入对象存储——单店本地部署，够用。process.cwd() 而不是
// __dirname：项目里 nest start --watch / node dist/main 都是在 apps/backend 这个
// 包目录下启动的，不用去猜 dev/prod 两种编译产物下 __dirname 差几层
const UPLOADS_DIR = join(process.cwd(), 'uploads', 'dishes');
mkdirSync(UPLOADS_DIR, { recursive: true });

// 扩展名从校验通过的 mimetype 映射过来，不信任客户端传来的原始文件名——避免
// "mimetype 是图片但文件名后缀是 .exe" 这种不一致（虽然下面的读取接口靠文件名格式
// 校验已经能挡住，但从源头就不让这种文件长这样落盘更干净）
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// 读取接口靠这个格式校验挡路径穿越（比如 ../../etc/passwd）——生成的文件名本来就是
// 这个格式，不合这个格式的请求直接拒绝，不进 res.sendFile
const DISH_IMAGE_FILENAME_PATTERN = /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i;

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

  // 只能对着一个已存在的菜品传图，所以新增菜品的表单没有上传入口——先建菜品，编辑的时候再传图
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('manager')
  @Post('dishes/:id/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${MIME_EXTENSION[file.mimetype]}`),
      }),
      fileFilter: (_req, file, cb) => {
        if (!MIME_EXTENSION[file.mimetype]) {
          cb(new BadRequestException('只支持 JPEG/PNG/WebP 图片'), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadDishImage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择要上传的图片');
    return this.menuService.updateDishImage(id, `/uploads/dishes/${file.filename}`);
  }

  // 不鉴权：点餐页面要能直接 <img src> 加载这张图，不可能带 staff token 请求
  @Get('uploads/dishes/:filename')
  serveDishImage(@Param('filename') filename: string, @Res() res: Response) {
    if (!DISH_IMAGE_FILENAME_PATTERN.test(filename)) {
      res.status(400).end();
      return;
    }
    const filePath = join(UPLOADS_DIR, filename);
    if (!existsSync(filePath)) {
      res.status(404).end();
      return;
    }
    res.sendFile(filePath);
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
