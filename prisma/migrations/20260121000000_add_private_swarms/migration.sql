-- AlterTable
ALTER TABLE "Swarm" ADD COLUMN     "inviteCode" TEXT,
ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Swarm_inviteCode_key" ON "Swarm"("inviteCode");

-- Generate invite codes for existing swarms (optional - can leave null until manager requests)
-- This uses PostgreSQL's gen_random_uuid() to generate unique invite codes
UPDATE "Swarm" SET "inviteCode" = SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 12) WHERE "inviteCode" IS NULL;
