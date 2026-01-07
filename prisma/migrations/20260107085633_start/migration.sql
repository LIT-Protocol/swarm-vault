-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionTargetStatus" AS ENUM ('PENDING', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Swarm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "socialUrl" TEXT,
    "litPkpPublicKey" TEXT NOT NULL,
    "litPkpTokenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Swarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwarmManager" (
    "id" TEXT NOT NULL,
    "swarmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwarmManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SwarmMembership" (
    "id" TEXT NOT NULL,
    "swarmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentWalletAddress" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SwarmMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "swarmId" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "template" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTarget" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "resolvedTxData" JSONB NOT NULL,
    "userOpHash" TEXT,
    "txHash" TEXT,
    "status" "TransactionTargetStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "SwarmManager_swarmId_userId_key" ON "SwarmManager"("swarmId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SwarmMembership_swarmId_userId_key" ON "SwarmMembership"("swarmId", "userId");

-- AddForeignKey
ALTER TABLE "SwarmManager" ADD CONSTRAINT "SwarmManager_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwarmManager" ADD CONSTRAINT "SwarmManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwarmMembership" ADD CONSTRAINT "SwarmMembership_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SwarmMembership" ADD CONSTRAINT "SwarmMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_swarmId_fkey" FOREIGN KEY ("swarmId") REFERENCES "Swarm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTarget" ADD CONSTRAINT "TransactionTarget_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTarget" ADD CONSTRAINT "TransactionTarget_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "SwarmMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
