import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// 全局模块：所有 feature module 都要用到数据库访问，避免每个模块重复 import
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
