-- CreateEnum
CREATE TYPE "PrintJobType" AS ENUM ('kitchen', 'receipt');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('pending', 'printed', 'failed');

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "type" "PrintJobType" NOT NULL,
    "orderId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
