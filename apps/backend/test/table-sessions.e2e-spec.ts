import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：joinOrAutoOpen 曾经存在"先查会话、没有就建"两步不加锁的竞态条件——
// 两个几乎同时到达的并发请求（比如 React StrictMode 下同一个 useEffect 触发两次）
// 都可能在对方提交前读到"还没开台"，各自建出一个会话。
// 修复方式是用 SELECT ... FOR UPDATE 锁住桌台行，让并发请求排队。这里用真实并发请求
// 复现当初的场景，而不是用 mock（mock 掉的 Prisma 客户端体现不出数据库锁的效果，测不出这个问题）。
describe('POST /table-sessions/:tableId/join (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let tableId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const table = await prisma.table.create({
      data: {
        tableNumber: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        capacity: 2,
        status: 'idle',
      },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    const links = await prisma.tableSessionTable.findMany({ where: { tableId } });
    const sessionIds = links.map((l) => l.sessionId);

    if (sessionIds.length) {
      const orders = await prisma.order.findMany({ where: { tableSessionId: { in: sessionIds } } });
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length) {
        await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      await prisma.tableSessionTable.deleteMany({ where: { tableId } });
      await prisma.tableSession.deleteMany({ where: { id: { in: sessionIds } } });
    }

    await prisma.table.delete({ where: { id: tableId } });
  });

  it('并发 join 同一张空闲桌台，只会创建一个会话/订单', async () => {
    const server = app.getHttpServer();

    const [resA, resB] = await Promise.all([
      request(server).post(`/api/table-sessions/${tableId}/join`).send({ partySize: 2 }),
      request(server).post(`/api/table-sessions/${tableId}/join`).send({ partySize: 2 }),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.orderId).toBe(resB.body.orderId);

    const activeSessions = await prisma.tableSessionTable.findMany({
      where: { tableId, session: { status: { in: ['open', 'pending_checkout'] } } },
    });
    expect(activeSessions).toHaveLength(1);
  });

  it('两边拿到的令牌都能正常访问同一个订单，不会出现 orderId 对不上的 403', async () => {
    const server = app.getHttpServer();

    const [resA, resB] = await Promise.all([
      request(server).post(`/api/table-sessions/${tableId}/join`).send({ partySize: 2 }),
      request(server).post(`/api/table-sessions/${tableId}/join`).send({ partySize: 2 }),
    ]);

    const getWithTokenB = await request(server)
      .get(`/api/orders/${resA.body.orderId}`)
      .set('Authorization', `Bearer ${resB.body.sessionToken}`);

    expect(getWithTokenB.status).toBe(200);
  });

  it('桌台处于 pending_clear 时拒绝新的 join，返回 table_pending_clear', async () => {
    const server = app.getHttpServer();
    await prisma.table.update({ where: { id: tableId }, data: { status: 'pending_clear' } });

    const res = await request(server).post(`/api/table-sessions/${tableId}/join`).send({});

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('table_pending_clear');
  });
});
