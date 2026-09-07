-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_dishId_fkey";

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "dishId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
