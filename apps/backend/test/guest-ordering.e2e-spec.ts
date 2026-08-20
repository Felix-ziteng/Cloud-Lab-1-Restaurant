import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：外卖/自提顾客自助下单（POST /orders/guest、GET /orders/lookup）是唯一对公网开放的
// 入口，这里两件事最重要：(1) deliveryEnabled 开关能不能真正把这两个接口整体挡住
// （标准部署默认关闭这个模块，见 delivery_reservation_modules_off_by_default 记忆），
// (2) guest token 的作用域隔离（拿着 A 单的 token 碰不到 B 单）。
describe('外卖/自提顾客自助下单 (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let managerToken: string;
  let managerId: string;
  let categoryId: string;
  let dishId: string;

  async function setDeliveryEnabled(enabled: boolean) {
    await request(app.getHttpServer())
      .patch('/api/store-config')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ deliveryEnabled: enabled });
  }

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
      data: { name: 'E2E-外卖店长', role: 'manager', pinHash: await bcrypt.hash('000003', 10), status: 'active' },
    });
    managerId = manager.id;
    managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });

    const category = await prisma.category.create({ data: { name: 'E2E-外卖分类', sortOrder: 0 } });
    categoryId = category.id;
    const dish = await prisma.dish.create({ data: { categoryId, name: 'E2E-外卖菜', price: 25, sortOrder: 0 } });
    dishId = dish.id;
  });

  afterAll(async () => {
    // 标准部署这两个模块默认关闭（见项目记忆），测完务必把开关调回 false，
    // 不能让测试run完之后把这台开发机的真实配置状态改掉
    await setDeliveryEnabled(false);
    await prisma.dish.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await prisma.staffAccount.delete({ where: { id: managerId } });
    await app.close();
  });

  describe('deliveryEnabled 关闭时', () => {
    beforeAll(async () => setDeliveryEnabled(false));

    it('POST /orders/guest 返回 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({ type: 'takeout', items: [{ dishId, quantity: 1 }], customerContact: '13900000001' });
      expect(res.status).toBe(403);
    });

    it('GET /orders/lookup 返回 403', async () => {
      const res = await request(app.getHttpServer()).get('/api/orders/lookup?orderNumber=1&phone=13900000001');
      expect(res.status).toBe(403);
    });
  });

  describe('deliveryEnabled 开启时', () => {
    beforeAll(async () => setDeliveryEnabled(true));

    // 用数组而不是单个变量记录这一轮建的所有单：断言失败会在到达清理代码前就抛出，
    // 放在 afterEach 里才能保证不管测试成不成功，建过的单都会被收拾掉（之前踩过这个坑）
    let createdOrderIds: string[];

    beforeEach(() => {
      createdOrderIds = [];
    });

    afterEach(async () => {
      if (createdOrderIds.length === 0) return;
      await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    });

    it('顾客可以自助下一单外卖/自提订单，不需要登录', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({ type: 'takeout', items: [{ dishId, quantity: 2 }], customerContact: '13900000001' });

      expect(res.status).toBe(201);
      expect(res.body.orderId).toBeDefined();
      expect(res.body.token).toBeDefined();
      expect(Number(res.body.order.total)).toBe(50);

      createdOrderIds.push(res.body.orderId);
    });

    it('配送单没填地址会被拒绝', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({ type: 'delivery', items: [{ dishId, quantity: 1 }], customerContact: '13900000001' });
      expect(res.status).toBe(400);
    });

    it('guest token 只能访问自己那一单，访问别的单返回 403', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({ type: 'takeout', items: [{ dishId, quantity: 1 }], customerContact: '13900000002' });
      createdOrderIds.push(created.body.orderId);

      const other = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({ type: 'takeout', items: [{ dishId, quantity: 1 }], customerContact: '13900000003' });
      createdOrderIds.push(other.body.orderId);

      const res = await request(app.getHttpServer())
        .get(`/api/orders/${other.body.orderId}`)
        .set('Authorization', `Bearer ${created.body.token}`);
      expect(res.status).toBe(403);
    });

    it('订单号 + 手机号能查回订单；手机号不对查不到', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/orders/guest')
        .send({ type: 'takeout', items: [{ dishId, quantity: 1 }], customerContact: '13900000004' });
      createdOrderIds.push(created.body.orderId);
      const orderId = created.body.orderId;
      const number = created.body.order.orderNumber;

      const wrongPhone = await request(app.getHttpServer()).get(
        `/api/orders/lookup?orderNumber=${number}&phone=00000000000`,
      );
      expect(wrongPhone.status).toBe(404);

      const rightPhone = await request(app.getHttpServer()).get(
        `/api/orders/lookup?orderNumber=${number}&phone=13900000004`,
      );
      expect(rightPhone.status).toBe(200);
      expect(rightPhone.body.orderId).toBe(orderId);

      // 用查回来的新 token 也应该能正常访问订单
      const check = await request(app.getHttpServer())
        .get(`/api/orders/${orderId}`)
        .set('Authorization', `Bearer ${rightPhone.body.token}`);
      expect(check.status).toBe(200);
    });
  });
});
