-- AlterTable
ALTER TABLE "Pizza" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TimeSlot" ADD COLUMN     "closed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lunchOpen" BOOLEAN NOT NULL DEFAULT true,
    "lunchStart" INTEGER NOT NULL DEFAULT 660,
    "lunchEnd" INTEGER NOT NULL DEFAULT 840,
    "dinnerOpen" BOOLEAN NOT NULL DEFAULT true,
    "dinnerStart" INTEGER NOT NULL DEFAULT 1080,
    "dinnerEnd" INTEGER NOT NULL DEFAULT 1320,
    "slotCapacity" INTEGER NOT NULL DEFAULT 5,
    "daysAhead" INTEGER NOT NULL DEFAULT 7,
    "closedWeekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosedDay" (
    "date" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "ClosedDay_pkey" PRIMARY KEY ("date")
);

