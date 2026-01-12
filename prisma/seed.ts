import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create a test manager
  const manager = await prisma.user.upsert({
    where: { walletAddress: "0x1234567890123456789012345678901234567890" },
    update: {},
    create: {
      walletAddress: "0x1234567890123456789012345678901234567890",
    },
  });

  console.log("Created manager:", manager.id);

  // Create a test swarm
  const swarm = await prisma.swarm.upsert({
    where: { id: "test-swarm-id" },
    update: {},
    create: {
      id: "test-swarm-id",
      name: "Test Swarm",
      description: "A test swarm for development purposes",
      litPkpPublicKey: "0x" + "0".repeat(128),
      litPkpTokenId: "0",
      managers: {
        create: {
          userId: manager.id,
        },
      },
    },
  });

  console.log("Created swarm:", swarm.id);

  // Create a test user
  const user = await prisma.user.upsert({
    where: { walletAddress: "0x0987654321098765432109876543210987654321" },
    update: {},
    create: {
      walletAddress: "0x0987654321098765432109876543210987654321",
    },
  });

  console.log("Created user:", user.id);

  // Create a membership
  const membership = await prisma.swarmMembership.upsert({
    where: {
      swarmId_userId: {
        swarmId: swarm.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      swarmId: swarm.id,
      userId: user.id,
      agentWalletAddress: "0xabcdef1234567890abcdef1234567890abcdef12",
    },
  });

  console.log("Created membership:", membership.id);

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
