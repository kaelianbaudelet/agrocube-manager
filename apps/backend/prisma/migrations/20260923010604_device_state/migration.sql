-- CreateEnum
CREATE TYPE "DeviceState" AS ENUM ('UNINITIALIZED', 'ACTIVE');

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "initializedAt" TIMESTAMP(3),
ADD COLUMN     "state" "DeviceState" NOT NULL DEFAULT 'UNINITIALIZED';

-- Devices that already sent data are initialized.
UPDATE "Device" d
SET "state" = 'ACTIVE',
    "initializedAt" = (SELECT min(r."recordedAt") FROM "SensorReading" r WHERE r."deviceId" = d."id")
WHERE EXISTS (SELECT 1 FROM "SensorReading" r WHERE r."deviceId" = d."id");
