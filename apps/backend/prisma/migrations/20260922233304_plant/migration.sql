-- CreateEnum
CREATE TYPE "CommandType" AS ENUM ('WATER');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'SENT', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SensorReading" (
    "id" BIGSERIAL NOT NULL,
    "deviceId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature" DOUBLE PRECISION,
    "soilMoisture" DOUBLE PRECISION,
    "light" DOUBLE PRECISION,
    "waterLevel" DOUBLE PRECISION,

    CONSTRAINT "SensorReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "CommandType" NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" "CommandStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Device_apiKeyHash_key" ON "Device"("apiKeyHash");

-- CreateIndex
CREATE INDEX "SensorReading_deviceId_recordedAt_idx" ON "SensorReading"("deviceId", "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "Command_deviceId_createdAt_idx" ON "Command"("deviceId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SensorReading" ADD CONSTRAINT "SensorReading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Command" ADD CONSTRAINT "Command_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
