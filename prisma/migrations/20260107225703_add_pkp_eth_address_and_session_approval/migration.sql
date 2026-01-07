/*
  Warnings:

  - Added the required column `litPkpEthAddress` to the `Swarm` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Swarm" ADD COLUMN     "litPkpEthAddress" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SwarmMembership" ADD COLUMN     "sessionKeyApproval" TEXT;
