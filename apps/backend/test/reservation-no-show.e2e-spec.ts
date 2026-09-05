import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：PATCH /reservations/:id/no-show 目前"代码里先修改，但暂不启用"——预定模块整体
// 挂在 reservationEnabled 开关下（当前是 false），所以这条路由天然不可达；这里临时打开开关
// 验证逻辑本身是对的，测完务必调回 false（不能让测试跑完把开发机的真实配置状态改掉）。
describe('预定标记未到 (e2e，暂无前端入口，仅接口层验证)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let staffToken: string;
  let staffId: string;

  async function setReservationEnabled(enabled: boolean) {
    await request(app.getHttpServer())
      .patch('/api/store-config')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reservationEnabled: enabled });
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

    // PATCH /store-config 是 manager 专属，这里的 role 必须是 manager 才能切开关
    const staff = await prisma.staffAccount.create({
      data: { name: 'E2E-预定店长', role: 'manager', pinHash: await bcrypt.hash('900020', 10), status: 'active' },
    });
    staffId = staff.id;
    staffToken = jwtService.sign({ type: 'staff', sub: staff.id, role: 'manager' });

    await setReservationEnabled(true);
  });

  afterAll(async () => {
    await setReservationEnabled(false);
    await prisma.staffAccount.delete({ where: { id: staffId } });
    await app.close();
  });

  let reservationId: string;
  let tableId: string;

  // 清理放在 afterEach：断言失败会在到达清理代码前就抛出，这个坑在这一轮的其他测试文件里
  // 已经踩过好几次了（见项目记忆 e2e_test_conventions）
  afterEach(async () => {
    if (tableId) {
      const links = await prisma.tableSessionTable.findMany({ where: { tableId } });
      const sessionIds = links.map((l) => l.sessionId);
      const sessions = await prisma.tableSession.findMany({
        where: { id: { in: sessionIds } },
        include: { order: true },
      });
      for (const s of sessions) {
        if (s.order) {
          await prisma.orderItem.deleteMany({ where: { orderId: s.order.id } });
          await prisma.order.delete({ where: { id: s.order.id } });
        }
      }
      await prisma.tableSessionTable.deleteMany({ where: { tableId } });
      await prisma.tableSession.deleteMany({ where: { id: { in: sessionIds } } });
      await prisma.table.deleteMany({ where: { id: tableId } });
      tableId = '';
    }
    if (reservationId) {
      await prisma.reservation.deleteMany({ where: { id: reservationId } });
      reservationId = '';
    }
  });

  async function createReservation() {
    const res = await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        customerName: 'E2E-预定顾客',
        phone: '13900000099',
        partySize: 2,
        reservedTime: new Date(Date.now() + 3600_000).toISOString(),
      });
    reservationId = res.body.id;
    return res.body;
  }

  it('reservationEnabled 关闭时这条路由整体不可达', async () => {
    await setReservationEnabled(false);
    const res = await request(app.getHttpServer())
      .patch('/api/reservations/00000000-0000-0000-0000-000000000000/no-show')
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
    await setReservationEnabled(true);
  });

  it('待到店的预定可以标记为未到', async () => {
    await createReservation();
    const res = await request(app.getHttpServer())
      .patch(`/api/reservations/${reservationId}/no-show`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('no_show');
  });

  it('已经到店的预定不能再标记为未到', async () => {
    const reservation = await createReservation();
    const table = await prisma.table.create({
      data: { tableNumber: `E2E-NOSHOW-${Date.now()}`, capacity: 2, status: 'idle', passcode: '6001' },
    });
    tableId = table.id;

    await request(app.getHttpServer())
      .post(`/api/reservations/${reservation.id}/arrive`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ tableIds: [table.id] });

    const res = await request(app.getHttpServer())
      .patch(`/api/reservations/${reservationId}/no-show`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(res.status).toBe(400);
  });
});
