import { PrismaClient, UserType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('Test1234!', 10);
  const users: Array<{ email: string; firstName: string; lastName: string; userType: UserType }> = [
    { email: 'shin@icetime.com',      firstName: '신',   lastName: '부모',  userType: 'PARENT' as UserType },
    { email: 'parent@teamplus.com',   firstName: '학부모', lastName: '테스트', userType: 'PARENT' as UserType },
    { email: 'coach@teamplus.com',    firstName: '코치',   lastName: '테스트', userType: 'COACH' as UserType },
    { email: 'admin@teamplus.com',    firstName: '관리자', lastName: '테스트', userType: 'ADMIN' as UserType },
    { email: 'director@teamplus.com', firstName: '감독',   lastName: '테스트', userType: 'DIRECTOR' as UserType },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash: hash, status: 'ACTIVE' },
      create: { ...u, passwordHash: hash, status: 'ACTIVE', isVerified: true },
    });
    console.log(`OK ${u.email} (${u.userType})`);
  }
  console.log('Done. password=Test1234!');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
