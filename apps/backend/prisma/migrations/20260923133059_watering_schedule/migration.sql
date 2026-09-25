-- CreateEnum
CREATE TYPE "ScheduleRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Command" ADD COLUMN     "scheduleId" TEXT;

-- CreateTable
CREATE TABLE "WateringSchedule" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "recurrence" "ScheduleRecurrence" NOT NULL,
    "weekdays" INTEGER[],
    "dayOfMonth" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WateringSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WateringSchedule_deviceId_idx" ON "WateringSchedule"("deviceId");

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WateringSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WateringSchedule" ADD CONSTRAINT "WateringSchedule_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WateringSchedule" ADD CONSTRAINT "WateringSchedule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
