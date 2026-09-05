-- AlterTable
ALTER TABLE "dishes" ADD COLUMN     "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "spicyLevel" INTEGER;

-- AlterTable
ALTER TABLE "store_config" ADD COLUMN     "showAllergens" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showSpicyLevel" BOOLEAN NOT NULL DEFAULT false;
