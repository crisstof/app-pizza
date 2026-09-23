-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "doughMarginPercent" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "DoughLog" (
    "date" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "prepared" INTEGER NOT NULL,
    "wasted" INTEGER NOT NULL,
    "demo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoughLog_pkey" PRIMARY KEY ("date","service")
);

