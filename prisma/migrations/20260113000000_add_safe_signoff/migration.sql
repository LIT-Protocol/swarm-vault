-- Add SAFE sign-off fields to Swarm
ALTER TABLE "Swarm" ADD COLUMN "safeAddress" TEXT;
ALTER TABLE "Swarm" ADD COLUMN "requireSafeSignoff" BOOLEAN NOT NULL DEFAULT false;

-- Create enum for ProposedActionStatus
CREATE TYPE "ProposedActionStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'EXPIRED');

-- Create enum for ProposedActionType
CREATE TYPE "ProposedActionType" AS ENUM ('SWAP', 'TRANSACTION');

-- Create ProposedAction table
CREATE TABLE "ProposedAction" (
    "id" TEXT NOT NULL,
    "swarmId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "actionType" "ProposedActionType" NOT NULL,
    "actionData" JSONB NOT NULL,
    "safeMessageHash" TEXT NOT NULL,
    "status" "ProposedActionStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "executionTxId" TEXT,

    CONSTRAINT "ProposedAction_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "ProposedAction" ADD CONSTRAINT "ProposedAction_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
