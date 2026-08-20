import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：2026-08-21 临时决策——还没接 POS 收款，"发起结账"直接让桌台进入待清台，
// 不再等 recordPayment 那一步（见 OrdersService.requestCheckout 的注释）。
// 这条行为等接了 POS 会改回"收款完成才待清台"，到时候这个测试也要跟着改。
describe('POST /orders/:id/checkout-request (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

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

  let tableId: string;
  let orderId: string;

  afterEach(async () => {
    if (!orderId) return;
    await prisma.orderItem.deleteMany({ where: { orderId } });
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

  it('发起结账后：订单变待结账，堂食桌台立刻变待清台（不等收款）', async () => {
    const server = app.getHttpServer();
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-CKO-${Date.now()}`, capacity: 2, status: 'idle' },
    });
    tableId = table.id;

    const joinRes = await request(server).post(`/api/table-sessions/${table.id}/join`).send({ partySize: 2 });
    orderId = joinRes.body.orderId;
    const guestToken = joinRes.body.sessionToken;

    const res = await request(server)
      .post(`/api/orders/${orderId}/checkout-request`)
      .set('Authorization', `Bearer ${guestToken}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('awaiting_payment');

    const updatedTable = await prisma.table.findUnique({ where: { id: table.id } });
    expect(updatedTable?.status).toBe('pending_clear');
  });
});
