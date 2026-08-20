-- AlterTable
-- 外卖/自提自助下单 + 预定这两个可选模块改成默认关闭：产品化阶段按客户定制打开，
-- 不是每次新建门店部署都默认暴露（外卖模块还涉及公网暴露面，见 ops/Caddyfile）
ALTER TABLE "store_config" ALTER COLUMN "deliveryEnabled" SET DEFAULT false;
ALTER TABLE "store_config" ALTER COLUMN "reservationEnabled" SET DEFAULT false;
