import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const manager = await prisma.staffAccount.create({
    data: { name: '店长', role: 'manager', pinHash: await bcrypt.hash('9999', 10) },
  });
  await prisma.staffAccount.create({
    data: { name: '小李', role: 'staff', pinHash: await bcrypt.hash('1234', 10) },
  });

  await prisma.table.createMany({
    data: [
      { tableNumber: 'A1', capacity: 2, passcode: '1234' },
      { tableNumber: 'A2', capacity: 4, passcode: '1235' },
      { tableNumber: 'B1', capacity: 6, zone: '包间', passcode: '1236' },
    ],
  });

  const staple = await prisma.category.create({ data: { name: '主食', sortOrder: 1 } });
  const drink = await prisma.category.create({ data: { name: '饮品', sortOrder: 2 } });

  await prisma.dish.createMany({
    data: [
      { categoryId: staple.id, name: '番茄炒蛋盖饭', price: 22, sortOrder: 1 },
      { categoryId: staple.id, name: '宫保鸡丁盖饭', price: 25, sortOrder: 2 },
      { categoryId: drink.id, name: '可乐', price: 6, sortOrder: 1 },
      { categoryId: drink.id, name: '柠檬茶', price: 8, sortOrder: 2 },
    ],
  });

  console.log('种子数据写入完成。');
  console.log(`店长 PIN: 9999，普通店员「小李」 PIN: 1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
