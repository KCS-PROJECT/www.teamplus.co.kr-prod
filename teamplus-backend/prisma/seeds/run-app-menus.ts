import { PrismaClient } from "@prisma/client";
import { seedAppMenus } from "./app-menus";

const prisma = new PrismaClient();

seedAppMenus(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ AppMenu 시드 오류:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
