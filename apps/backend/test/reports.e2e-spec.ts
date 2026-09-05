import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 回归测试：报表统计（营业额/订单量）是店长唯一能看的经营数据入口，算错了店长自己也发现不了。
// 用真实下单+收款流程验证"增量"而不是断言绝对值——开发机的库里可能已经有别的测试/手动验证
// 留下的历史订单，断言绝对总数会很脆弱，断言"这一单造成的营收/订单量变化量"才是稳的。
describe('经营概览报表 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let managerToken: string;
  let managerId: string;
  let staffToken: string;
  let staffId: string;
  let categoryId: string;
  let dishId: string; // 单价 30

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
      data: { name: 'E2E-报表店长', role: 'manager', pinHash: await bcrypt.hash('000001', 10), status: 'active' },
    });
    managerId = manager.id;
    managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });

    const staff = await prisma.staffAccount.create({
      data: { name: 'E2E-报表店员', role: 'staff', pinHash: await bcrypt.hash('000002', 10), status: 'active' },
    });
    staffId = staff.id;
    staffToken = jwtService.sign({ type: 'staff', sub: staff.id, role: 'staff' });

    const category = await prisma.category.create({ data: { name: 'E2E-报表分类', sortOrder: 0 } });
    categoryId = category.id;
    const dish = await prisma.dish.create({ data: { categoryId, name: 'E2E-报表菜', price: 30, sortOrder: 0 } });
    dishId = dish.id;
  });

  afterAll(async () => {
    await prisma.dish.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.staffAccount.delete({ where: { id: managerId } });
    await prisma.staffAccount.delete({ where: { id: staffId } });
    await app.close();
  });

  it('仅 manager 可访问，staff 403、未登录 401', async () => {
    const server = app.getHttpServer();
    const today = todayLocal();

    const asManager = await request(server)
      .get(`/api/reports/overview?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(asManager.status).toBe(200);

    const asStaff = await request(server)
      .get(`/api/reports/overview?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(asStaff.status).toBe(403);

    const anonymous = await request(server).get(`/api/reports/overview?from=${today}&to=${today}`);
    expect(anonymous.status).toBe(401);
  });

  it('开始日期晚于结束日期时报 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/overview?from=2026-08-20&to=2026-08-01')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(400);
  });

  it('日期格式不对时报 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/reports/overview?from=not-a-date&to=2026-08-20')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.status).toBe(400);
  });

  describe('一笔堂食收款完成后的营收/订单量增量', () => {
    let tableId: string;
    let orderId: string;

    // 清理放在 afterEach 而不是 it() 末尾：断言失败会在到达清理代码前就抛出，
    // 放在 it() 里会导致失败用例的测试数据残留，污染下一次跑测试（之前踩过这个坑）
    afterEach(async () => {
      if (!orderId || !tableId) return;
      await prisma.printJob.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.payment.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
      const links = await prisma.tableSessionTable.findMany({ where: { tableId } });
      await prisma.tableSessionTable.deleteMany({ where: { tableId } });
      await prisma.tableSession.deleteMany({ where: { id: { in: links.map((l) => l.sessionId) } } });
      await prisma.table.deleteMany({ where: { id: tableId } });
    });

    it('营业额和订单量按增量正确反映到当天报表里', async () => {
      const server = app.getHttpServer();
      const today = todayLocal();

      const before = await request(server)
        .get(`/api/reports/overview?from=${today}&to=${today}`)
        .set('Authorization', `Bearer ${managerToken}`);

      const table = await prisma.table.create({
        data: { tableNumber: `E2E-RPT-${Date.now()}`, capacity: 2, status: 'idle', passcode: '6002' },
      });
      tableId = table.id;
      const joinRes = await request(server).post(`/api/table-sessions/${table.id}/join`).send({ partySize: 2 });
      orderId = joinRes.body.orderId;
      const guestToken = joinRes.body.sessionToken;

      await request(server)
        .post(`/api/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [{ dishId, quantity: 1 }] });
      await request(server).post(`/api/orders/${orderId}/submit`).set('Authorization', `Bearer ${guestToken}`);
      await request(server)
        .post(`/api/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ method: 'cash', amount: 30 });

      const after = await request(server)
        .get(`/api/reports/overview?from=${today}&to=${today}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(after.body.revenue.total - before.body.revenue.total).toBeCloseTo(30);
      expect(after.body.revenue.byType.dine_in - before.body.revenue.byType.dine_in).toBeCloseTo(30);
      expect(after.body.orderCount.total - before.body.orderCount.total).toBe(1);
      expect(after.body.orderCount.byType.dine_in - before.body.orderCount.byType.dine_in).toBe(1);

      const todayRow = after.body.dailyBreakdown.find((r: { date: string }) => r.date === today);
      expect(todayRow).toBeDefined();
    });
  });
});
