-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "menuProfileIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "store_config" ADD COLUMN     "activeMenuProfileOverrideDate" TEXT,
ADD COLUMN     "activeMenuProfileOverrideId" TEXT;

-- CreateTable
CREATE TABLE "menu_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "menu_profiles_pkey" PRIMARY KEY ("id")
);
