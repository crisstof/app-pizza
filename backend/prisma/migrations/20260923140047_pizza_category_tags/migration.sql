-- AlterTable
ALTER TABLE "Pizza" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'TOMATO',
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE UNIQUE INDEX "Pizza_name_key" ON "Pizza"("name");

