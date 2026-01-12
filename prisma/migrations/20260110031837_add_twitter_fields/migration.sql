/*
  Warnings:

  - A unique constraint covering the columns `[twitterId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twitterId" TEXT,
ADD COLUMN     "twitterUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_twitterId_key" ON "User"("twitterId");
