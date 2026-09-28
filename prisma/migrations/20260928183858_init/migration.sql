-- DropForeignKey
ALTER TABLE "Trip" DROP CONSTRAINT "Trip_driverId_fkey";

-- CreateIndex
CREATE INDEX "Driver_status_idx" ON "Driver"("status");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
