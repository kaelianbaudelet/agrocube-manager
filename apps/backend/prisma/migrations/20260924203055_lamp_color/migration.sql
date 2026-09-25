-- AlterTable
ALTER TABLE "Command" ADD COLUMN     "lampColor" TEXT;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "lampColor" TEXT NOT NULL DEFAULT 'GROW';
