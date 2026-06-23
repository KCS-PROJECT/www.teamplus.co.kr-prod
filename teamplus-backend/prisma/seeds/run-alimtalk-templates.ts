import { PrismaClient } from "@prisma/client";
import { seedAlimtalkTemplates } from "./alimtalk-templates";

const prisma = new PrismaClient();

seedAlimtalkTemplates(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ AlimtalkTemplate 시드 오류:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
