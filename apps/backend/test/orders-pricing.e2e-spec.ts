import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：recalculateTotals 里"小计/折扣/改价/作废"这几种组合的算法，是全系统跟钱直接相关、
// 出错代价最高的一块逻辑，之前完全没有自动化测试保护。用真实的堂食下单流程
// （开台 -> 加菜 -> 店长调整）而不是单测 recalculateTotals 这个私有方法，
// 这样能同时验证"接口权限 + 计算结果"两层，不用为了单测把私有方法改成 public。
describe('订单价格计算 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let managerToken: string;
  let managerId: string;
  let categoryId: string;
  let dishAId: string; // 单价 20
  let dishBId: string; // 单价 15

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const manager = await prisma.staffAccount.create({
      data: { name: 'E2E-店长', role: 'manager', pinHash: await bcrypt.hash('000000', 10), status: 'active' },
    });
    managerId = manager.id;
    managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });

    const category = await prisma.category.create({ data: { name: 'E2E-分类', sortOrder: 0 } });
    categoryId = category.id;
    const dishA = await prisma.dish.create({
      data: { categoryId, name: 'E2E-菜A', price: 20, sortOrder: 0 },
    });
    const dishB = await prisma.dish.create({
      data: { categoryId, name: 'E2E-菜B', price: 15, sortOrder: 1 },
    });
    dishAId = dishA.id;
    dishBId = dishB.id;
  });

  afterAll(async () => {
    await prisma.dish.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.staffAccount.delete({ where: { id: managerId } });
    await app.close();
  });

  // 每个用例都开一张新桌台/新订单，互不干扰；测完立刻清理，不留脏数据
  let tableId: string;
  let orderId: string;
  let guestToken: string;
  let itemAId: string;

  async function openOrderWithItems(items: { dishId: string; quantity: number }[]) {
    const server = app.getHttpServer();
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, capacity: 2, status: 'idle' },
    });
    tableId = table.id;

    const joinRes = await request(server).post(`/api/table-sessions/${tableId}/join`).send({ partySize: 2 });
    orderId = joinRes.body.orderId;
    guestToken = joinRes.body.sessionToken;

    const addRes = await request(server)
      .post(`/api/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ items });

    return addRes;
  }

  afterEach(async () => {
    const links = await prisma.tableSessionTable.findMany({ where: { tableId } });
    const sessionIds = links.map((l) => l.sessionId);

    await prisma.priceAdjustment.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
    await prisma.tableSessionTable.deleteMany({ where: { tableId } });
    await prisma.tableSession.deleteMany({ where: { id: { in: sessionIds } } });
    await prisma.table.delete({ where: { id: tableId } });
  });

  it('小计 = 单价 x 数量，加菜后立刻反映在小计和合计里', async () => {
    const res = await openOrderWithItems([{ dishId: dishAId, quantity: 2 }]);
    expect(Number(res.body.subtotal)).toBe(40);
    expect(Number(res.body.total)).toBe(40);
  });

  it('discount 和 comp 可以叠加扣减，都从小计里减', async () => {
    await openOrderWithItems([{ dishId: dishAId, quantity: 2 }]); // 小计 40
    const server = app.getHttpServer();

    const afterDiscount = await request(server)
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'discount', amount: 5 });
    expect(Number(afterDiscount.body.total)).toBe(35);

    const afterComp = await request(server)
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'comp', amount: 3 });
    expect(Number(afterComp.body.discountTotal)).toBe(8);
    expect(Number(afterComp.body.total)).toBe(32);
  });

  it('price_override 挂在菜品项上：那一项按覆盖后的金额算，其余项照常计算', async () => {
    await openOrderWithItems([
      { dishId: dishAId, quantity: 2 }, // 20 x 2 = 40
      { dishId: dishBId, quantity: 1 }, // 15 x 1 = 15，小计本应是 55
    ]);
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    itemAId = items.find((i) => i.dishId === dishAId)!.id;

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'price_override', amount: 10, orderItemId: itemAId }); // A 项从 40 覆盖成 10

    expect(Number(res.body.subtotal)).toBe(25); // 10（覆盖后的 A） + 15（B 照常）
    expect(Number(res.body.total)).toBe(25);
  });

  it('同一菜品项的 price_override 以最新一条为准，不叠加', async () => {
    await openOrderWithItems([{ dishId: dishAId, quantity: 1 }]); // 小计 20
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    itemAId = items[0].id;
    const server = app.getHttpServer();

    await request(server)
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'price_override', amount: 8, orderItemId: itemAId });

    const res = await request(server)
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'price_override', amount: 12, orderItemId: itemAId });

    // 不是 8+12=20，也不是覆盖前的 20，是最后一条覆盖记录的 12
    expect(Number(res.body.subtotal)).toBe(12);
    expect(Number(res.body.total)).toBe(12);
  });

  it('price_override 不挂菜品项（整单改价）：直接覆盖 total，不再走"小计-折扣"计算', async () => {
    await openOrderWithItems([{ dishId: dishAId, quantity: 2 }]); // 小计 40
    const server = app.getHttpServer();

    await request(server)
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'discount', amount: 5 }); // 折扣 5，若不是整单改价，total 应该是 35

    const res = await request(server)
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'price_override', amount: 66 }); // 整单直接改成 66

    expect(Number(res.body.total)).toBe(66); // 不是 40-5=35，是整单覆盖的 66
    expect(Number(res.body.subtotal)).toBe(40); // 小计仍按原计算保留，供对账参考
  });

  it('void 作废某一项：该项不计入小计，其余项照常', async () => {
    await openOrderWithItems([
      { dishId: dishAId, quantity: 1 }, // 20
      { dishId: dishBId, quantity: 1 }, // 15，小计本应 35
    ]);
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    itemAId = items.find((i) => i.dishId === dishAId)!.id;

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'void', amount: 0, orderItemId: itemAId });

    expect(Number(res.body.subtotal)).toBe(15); // 只剩 B 项
    expect(Number(res.body.total)).toBe(15);
  });

  it('普通店员（非 manager）不能调用改价接口', async () => {
    await openOrderWithItems([{ dishId: dishAId, quantity: 1 }]);
    const staff = await prisma.staffAccount.create({
      data: { name: 'E2E-临时店员', role: 'staff', pinHash: await bcrypt.hash('111111', 10), status: 'active' },
    });
    const staffToken = jwtService.sign({ type: 'staff', sub: staff.id, role: 'staff' });

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/price-adjustments`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ type: 'discount', amount: 5 });

    expect(res.status).toBe(403);
    await prisma.staffAccount.delete({ where: { id: staff.id } });
  });
});
