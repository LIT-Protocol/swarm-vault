-- AlterTable
ALTER TABLE "User" ADD COLUMN     "apiKeyHash" TEXT,
ADD COLUMN     "apiKeyPrefix" TEXT,
ADD COLUMN     "apiKeyCreatedAt" TIMESTAMP(3);
