-- AlterTable
ALTER TABLE "store_config" ADD COLUMN     "tabletMenuLayout" TEXT NOT NULL DEFAULT 'compact',
ADD COLUMN     "tabletOpenPasscodeHash" TEXT;
