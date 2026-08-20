import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：POST /orders/:id/cancel 目前"代码里先修改，但暂不启用"（没有前端入口，
// 见 2026-08-20 决策记录），但既然实现了就要保证行为对：只有 manager 能调用、
// 已支付的订单不能取消、堂食订单取消后桌台要正确释放。
describe('订单取消 (e2e，暂无前端入口，仅接口层验证)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let managerToken: string;
  let managerId: string;
  let staffToken: string;
  let staffId: string;
  let categoryId: string;
  let dishId: string;

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
      data: { name: 'E2E-取消店长', role: 'manager', pinHash: await bcrypt.hash('900010', 10), status: 'active' },
    });
    managerId = manager.id;
    managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });

    const staff = await prisma.staffAccount.create({
      data: { name: 'E2E-取消店员', role: 'staff', pinHash: await bcrypt.hash('900011', 10), status: 'active' },
    });
    staffId = staff.id;
    staffToken = jwtService.sign({ type: 'staff', sub: staff.id, role: 'staff' });

    const category = await prisma.category.create({ data: { name: 'E2E-取消分类', sortOrder: 0 } });
    categoryId = category.id;
    const dish = await prisma.dish.create({ data: { categoryId, name: 'E2E-取消菜', price: 18, sortOrder: 0 } });
    dishId = dish.id;
  });

  afterAll(async () => {
    await prisma.dish.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.staffAccount.deleteMany({ where: { id: { in: [managerId, staffId] } } });
    await app.close();
  });

  let tableId: string;
  let orderId: string;

  afterEach(async () => {
    if (!orderId) return;
    await prisma.printJob.deleteMany({ where: { orderId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    orderId = '';
    if (tableId) {
      const links = await prisma.tableSessionTable.findMany({ where: { tableId } });
      await prisma.tableSessionTable.deleteMany({ where: { tableId } });
      await prisma.tableSession.deleteMany({ where: { id: { in: links.map((l) => l.sessionId) } } });
      await prisma.table.deleteMany({ where: { id: tableId } });
      tableId = '';
    }
  });

  async function openOrder() {
    const server = app.getHttpServer();
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-CXL-${Date.now()}`, capacity: 2, status: 'idle' },
    });
    tableId = table.id;
    const joinRes = await request(server).post(`/api/table-sessions/${table.id}/join`).send({ partySize: 2 });
    orderId = joinRes.body.orderId;
    const guestToken = joinRes.body.sessionToken;
    await request(server)
      .post(`/api/orders/${orderId}/items`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ items: [{ dishId, quantity: 1 }] });
    return { table, guestToken };
  }

  it('普通店员不能取消订单', async () => {
    await openOrder();
    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it('manager 取消订单：状态变成 cancelled，堂食桌台释放为待清台', async () => {
    const { table } = await openOrder();

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('cancelled');

    const updatedTable = await prisma.table.findUnique({ where: { id: table.id } });
    expect(updatedTable?.status).toBe('pending_clear');
  });

  it('已支付的订单不能取消', async () => {
    await openOrder();
    await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ method: 'cash', amount: 18 });

    const res = await request(app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(400);
  });

  it('取消的订单不计入报表的订单量', async () => {
    const server = app.getHttpServer();
    const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    const before = await request(server)
      .get(`/api/reports/overview?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${managerToken}`);

    await openOrder();
    await request(server).post(`/api/orders/${orderId}/cancel`).set('Authorization', `Bearer ${managerToken}`);

    const after = await request(server)
      .get(`/api/reports/overview?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(after.body.orderCount.total - before.body.orderCount.total).toBe(0);
  });
});
