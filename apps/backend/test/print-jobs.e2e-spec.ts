import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：打印队列是厨房出单这条链路唯一的持久化环节（WebSocket 通知本身"发了就忘"，
// 丢了没法补），这里验证的是队列本身的行为——鉴权、待打印列表、状态流转——以及
// submitRound/createStandaloneOrder/recordPayment 这几个业务动作真的会创建对应的任务，
// 不是只测打印队列 CRUD 本身。ESC/POS 指令生成（apps/print-agent）没有实体打印机，
// 这里测不到，也不该在这测——那是另一个包的职责。
describe('打印队列 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let printAgentToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    printAgentToken = app.get(ConfigService).get<string>('PRINT_AGENT_TOKEN')!;
  });

  afterAll(async () => {
    await app.close();
  });

  it('打印代理凭证不对时拒绝访问', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/print-jobs/pending')
      .set('X-Print-Agent-Token', 'wrong-token');
    expect(res.status).toBe(401);
  });

  it('没带凭证也拒绝访问', async () => {
    const res = await request(app.getHttpServer()).get('/api/print-jobs/pending');
    expect(res.status).toBe(401);
  });

  describe('订单动作触发打印任务', () => {
    let categoryId: string;
    let dishId: string;
    let tableId: string;
    let orderId: string;

    beforeAll(async () => {
      const category = await prisma.category.create({ data: { name: 'E2E-打印分类', sortOrder: 0 } });
      categoryId = category.id;
      const dish = await prisma.dish.create({ data: { categoryId, name: 'E2E-打印菜', price: 12, sortOrder: 0 } });
      dishId = dish.id;
    });

    afterAll(async () => {
      await prisma.dish.deleteMany({ where: { categoryId } });
      await prisma.category.delete({ where: { id: categoryId } });
    });

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

    it('堂食提交一轮点餐后，生成一个厨房打印任务，内容跟这一轮的菜品一致', async () => {
      const server = app.getHttpServer();
      const table = await prisma.table.create({
        data: { tableNumber: `E2E-PRT-${Date.now()}`, capacity: 2, status: 'idle' },
      });
      tableId = table.id;

      const joinRes = await request(server).post(`/api/table-sessions/${table.id}/join`).send({ partySize: 2 });
      orderId = joinRes.body.orderId;
      const guestToken = joinRes.body.sessionToken;

      await request(server)
        .post(`/api/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [{ dishId, quantity: 3, notes: '少放盐' }] });
      await request(server).post(`/api/orders/${orderId}/submit`).set('Authorization', `Bearer ${guestToken}`);

      const jobs = await request(server)
        .get('/api/print-jobs/pending')
        .set('X-Print-Agent-Token', printAgentToken);

      const job = jobs.body.find((j: { orderId: string }) => j.orderId === orderId);
      expect(job).toBeDefined();
      expect(job.type).toBe('kitchen');
      expect(job.status).toBe('pending');
      expect(job.payload.items).toEqual([{ dishName: 'E2E-打印菜', quantity: 3, notes: '少放盐' }]);
      expect(job.payload.tableLabel).toBe(table.tableNumber);
      expect(job.payload.roundNumber).toBe(1);
    });

    it('店员记录收款后，生成一个收据打印任务，金额跟订单一致', async () => {
      const server = app.getHttpServer();
      const table = await prisma.table.create({
        data: { tableNumber: `E2E-PRT-${Date.now()}`, capacity: 2, status: 'idle' },
      });
      tableId = table.id;

      const manager = await prisma.staffAccount.create({
        data: { name: 'E2E-打印店长', role: 'manager', pinHash: await bcrypt.hash('900030', 10), status: 'active' },
      });
      const jwtService = app.get(JwtService);
      const managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });

      const joinRes = await request(server).post(`/api/table-sessions/${table.id}/join`).send({ partySize: 2 });
      orderId = joinRes.body.orderId;
      const guestToken = joinRes.body.sessionToken;

      await request(server)
        .post(`/api/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ items: [{ dishId, quantity: 2 }] });
      await request(server).post(`/api/orders/${orderId}/submit`).set('Authorization', `Bearer ${guestToken}`);
      await request(server)
        .post(`/api/orders/${orderId}/payments`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ method: 'cash', amount: 24 });

      const jobs = await request(server)
        .get('/api/print-jobs/pending')
        .set('X-Print-Agent-Token', printAgentToken);
      const receiptJob = jobs.body.find(
        (j: { orderId: string; type: string }) => j.orderId === orderId && j.type === 'receipt',
      );
      expect(receiptJob).toBeDefined();
      expect(receiptJob.payload.total).toBe('24');
      expect(receiptJob.payload.paymentMethod).toBe('cash');

      await prisma.staffAccount.delete({ where: { id: manager.id } });
    });
  });

  describe('任务状态流转', () => {
    let categoryId: string;
    let dishId: string;
    let orderId: string;
    let jobId: string;

    beforeAll(async () => {
      const category = await prisma.category.create({ data: { name: 'E2E-打印状态分类', sortOrder: 0 } });
      categoryId = category.id;
      const dish = await prisma.dish.create({ data: { categoryId, name: 'E2E-打印状态菜', price: 10, sortOrder: 0 } });
      dishId = dish.id;
    });

    afterAll(async () => {
      await prisma.dish.deleteMany({ where: { categoryId } });
      await prisma.category.delete({ where: { id: categoryId } });
    });

    beforeEach(async () => {
      const manager = await prisma.staffAccount.create({
        data: { name: 'E2E-临时', role: 'manager', pinHash: await bcrypt.hash('900030', 10), status: 'active' },
      });
      const order = await prisma.order.create({
        data: { type: 'takeout', createdByType: 'staff', createdByStaffId: manager.id, customerContact: '123' },
      });
      orderId = order.id;
      const job = await prisma.printJob.create({
        data: {
          type: 'kitchen',
          orderId,
          payload: { orderId, orderNumber: order.orderNumber, orderType: 'takeout', tableLabel: null, roundNumber: 1, items: [], createdAt: new Date().toISOString() },
        },
      });
      jobId = job.id;
      await prisma.staffAccount.delete({ where: { id: manager.id } });
    });

    afterEach(async () => {
      await prisma.printJob.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    });

    it('标记打印成功后，不再出现在待打印列表里', async () => {
      const server = app.getHttpServer();
      await request(server)
        .patch(`/api/print-jobs/${jobId}`)
        .set('X-Print-Agent-Token', printAgentToken)
        .send({ status: 'printed' });

      const pending = await request(server).get('/api/print-jobs/pending').set('X-Print-Agent-Token', printAgentToken);
      expect(pending.body.find((j: { id: string }) => j.id === jobId)).toBeUndefined();

      const job = await prisma.printJob.findUnique({ where: { id: jobId } });
      expect(job?.status).toBe('printed');
      expect(job?.printedAt).not.toBeNull();
    });

    it('标记打印失败后记录错误信息，同样不再出现在待打印列表里', async () => {
      const server = app.getHttpServer();
      await request(server)
        .patch(`/api/print-jobs/${jobId}`)
        .set('X-Print-Agent-Token', printAgentToken)
        .send({ status: 'failed', errorMessage: 'connect ECONNREFUSED' });

      const pending = await request(server).get('/api/print-jobs/pending').set('X-Print-Agent-Token', printAgentToken);
      expect(pending.body.find((j: { id: string }) => j.id === jobId)).toBeUndefined();

      const job = await prisma.printJob.findUnique({ where: { id: jobId } });
      expect(job?.status).toBe('failed');
      expect(job?.errorMessage).toBe('connect ECONNREFUSED');
    });
  });
});
