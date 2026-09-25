-- AlterEnum
ALTER TYPE "CommandType" ADD VALUE 'LAMP';

-- AlterTable
ALTER TABLE "Command" ADD COLUMN     "lampOn" BOOLEAN,
ALTER COLUMN "durationMs" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "lampOn" BOOLEAN NOT NULL DEFAULT false;
