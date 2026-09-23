-- DropIndex
DROP INDEX "TimeSlot_startsAt_idx";

-- CreateIndex
CREATE UNIQUE INDEX "TimeSlot_startsAt_key" ON "TimeSlot"("startsAt");
