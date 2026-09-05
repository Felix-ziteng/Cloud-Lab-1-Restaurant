-- DropForeignKey
ALTER TABLE "dish_modifier_groups" DROP CONSTRAINT "dish_modifier_groups_dishId_fkey";

-- DropForeignKey
ALTER TABLE "modifier_options" DROP CONSTRAINT "modifier_options_groupId_fkey";

-- AddForeignKey
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_modifier_groups" ADD CONSTRAINT "dish_modifier_groups_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
