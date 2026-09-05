import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：桌台平板每桌固定开台密码——密码直接定位到桌，不管这张桌当前是空闲
// 还是已被占用（比如前台先开台了）。取代原来"全店统一密码 + 只能选空闲桌"的机制。
describe('桌台平板开台 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let managerToken: string;
  let managerId: string;

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
      data: { name: 'E2E-平板店长', role: 'manager', pinHash: await bcrypt.hash('900020', 10), status: 'active' },
    });
    managerId = manager.id;
    managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });
  });

  afterAll(async () => {
    await prisma.staffAccount.delete({ where: { id: managerId } });
    await app.close();
  });

  let tableId: string;

  afterEach(async () => {
    if (!tableId) return;
    const links = await prisma.tableSessionTable.findMany({ where: { tableId } });
    const sessionIds = links.map((l) => l.sessionId);
    if (sessionIds.length) {
      const orders = await prisma.order.findMany({ where: { tableSessionId: { in: sessionIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
      await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
      await prisma.tableSessionTable.deleteMany({ where: { tableId } });
      await prisma.tableSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    await prisma.table.delete({ where: { id: tableId } });
    tableId = '';
  });

  it('POST /tables/resolve-passcode：密码不对 404', async () => {
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle', passcode: '5001' },
    });
    tableId = table.id;

    const res = await request(app.getHttpServer()).post('/api/tables/resolve-passcode').send({ passcode: '0000' });
    expect(res.status).toBe(404);
  });

  it('POST /tables/resolve-passcode：密码对了返回这张桌，包含当前状态', async () => {
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle', passcode: '5002' },
    });
    tableId = table.id;

    const res = await request(app.getHttpServer()).post('/api/tables/resolve-passcode').send({ passcode: '5002' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(tableId);
    expect(res.body.status).toBe('idle');
  });

  it('POST /table-sessions/:tableId/tablet-open：密码不对拒绝，不创建会话', async () => {
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle', passcode: '5003' },
    });
    tableId = table.id;

    const res = await request(app.getHttpServer())
      .post(`/api/table-sessions/${tableId}/tablet-open`)
      .send({ partySize: 2, passcode: '0000' });

    expect(res.status).toBe(403);

    const updated = await prisma.table.findUnique({ where: { id: tableId } });
    expect(updated?.status).toBe('idle');
  });

  it('POST /table-sessions/:tableId/tablet-open：密码对了正常开台，桌台变 occupied，GET /tables/idle 不再列出它', async () => {
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle', passcode: '5004' },
    });
    tableId = table.id;

    const res = await request(app.getHttpServer())
      .post(`/api/table-sessions/${tableId}/tablet-open`)
      .send({ partySize: 3, passcode: '5004' });

    expect(res.status).toBe(201);
    expect(res.body.sessionToken).toBeDefined();
    expect(res.body.tableNumber).toBe(table.tableNumber);

    const updated = await prisma.table.findUnique({ where: { id: tableId } });
    expect(updated?.status).toBe('occupied');

    const idleList = await request(app.getHttpServer()).get('/api/tables/idle');
    expect(idleList.body.some((t: { id: string }) => t.id === tableId)).toBe(false);
  });

  it('前台已经开台的桌，平板凭密码仍能查到（状态 occupied）并直接接入同一个会话，而不是报错', async () => {
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle', passcode: '5005' },
    });
    tableId = table.id;

    // 前台手动开台（店员登录后的入口，不经过平板密码）
    const openRes = await request(app.getHttpServer())
      .post('/api/table-sessions')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ tableIds: [tableId], partySize: 2 });
    expect(openRes.status).toBe(201);

    // 平板这时候才拿到这张桌的密码，resolve-passcode 应该还能查到，状态是 occupied
    const resolveRes = await request(app.getHttpServer())
      .post('/api/tables/resolve-passcode')
      .send({ passcode: '5005' });
    expect(resolveRes.status).toBe(201);
    expect(resolveRes.body.status).toBe('occupied');

    // 不传 partySize（前端已被占用桌不问人数），应该直接接入前台开的那个会话，而不是报错
    const openTabletRes = await request(app.getHttpServer())
      .post(`/api/table-sessions/${tableId}/tablet-open`)
      .send({ passcode: '5005' });
    expect(openTabletRes.status).toBe(201);
    expect(openTabletRes.body.orderId).toBe(openRes.body.order.id);
  });
});
