import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：桌台平板（流动、店员现场选桌开台）的开台密码校验 + 密码哈希不泄漏。
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

    // 设置一个已知的开台密码，供下面的用例校验
    await request(app.getHttpServer())
      .patch('/api/store-config')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ tabletOpenPasscode: '4321' });
  });

  afterAll(async () => {
    // 收尾：把测试期间设置的密码/布局都清回默认状态，不留痕迹
    await prisma.storeConfig.update({
      where: { id: 1 },
      data: { tabletOpenPasscodeHash: null, tabletMenuLayout: 'compact' },
    });
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

  it('GET /store-config 不会泄漏 tabletOpenPasscodeHash', async () => {
    const res = await request(app.getHttpServer()).get('/api/store-config');
    expect(res.status).toBe(200);
    expect(res.body.tabletOpenPasscodeHash).toBeUndefined();
    expect(res.body.tabletMenuLayout).toBeDefined();
  });

  it('POST /store-config/verify-tablet-passcode：密码不对返回 valid:false，密码对了返回 true', async () => {
    const server = app.getHttpServer();
    const wrong = await request(server).post('/api/store-config/verify-tablet-passcode').send({ passcode: '0000' });
    expect(wrong.body).toEqual({ valid: false });

    const right = await request(server).post('/api/store-config/verify-tablet-passcode').send({ passcode: '4321' });
    expect(right.body).toEqual({ valid: true });
  });

  it('POST /table-sessions/:tableId/tablet-open：密码不对拒绝，不创建会话', async () => {
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle' },
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
      data: { tableNumber: `E2E-TAB-${Date.now()}`, capacity: 4, status: 'idle' },
    });
    tableId = table.id;

    const res = await request(app.getHttpServer())
      .post(`/api/table-sessions/${tableId}/tablet-open`)
      .send({ partySize: 3, passcode: '4321' });

    expect(res.status).toBe(201);
    expect(res.body.sessionToken).toBeDefined();
    expect(res.body.tableNumber).toBe(table.tableNumber);

    const updated = await prisma.table.findUnique({ where: { id: tableId } });
    expect(updated?.status).toBe('occupied');

    const idleList = await request(app.getHttpServer()).get('/api/tables/idle');
    expect(idleList.body.some((t: { id: string }) => t.id === tableId)).toBe(false);
  });
});
