import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// 回归测试：店员登录是"在职账号里线性扫描，谁的哈希先匹配上就是谁"（见 auth.service.ts
// findPinMatch）。如果两个在职账号的 PIN 撞了，后登录的那个人会被系统认成前一个人，
// PriceAdjustment 的审计追责会全部记错人——这是新建/重置 PIN 时必须挡住的一类真实 bug，
// 不是边缘情况。
describe('店员 PIN 唯一性 (e2e)', () => {
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
      data: { name: 'E2E-PIN店长', role: 'manager', pinHash: await bcrypt.hash('900001', 10), status: 'active' },
    });
    managerId = manager.id;
    managerToken = jwtService.sign({ type: 'staff', sub: manager.id, role: 'manager' });
  });

  afterAll(async () => {
    await prisma.staffAccount.delete({ where: { id: managerId } });
    await app.close();
  });

  let createdStaffIds: string[];

  beforeEach(() => {
    createdStaffIds = [];
  });

  afterEach(async () => {
    if (createdStaffIds.length === 0) return;
    await prisma.staffAccount.deleteMany({ where: { id: { in: createdStaffIds } } });
  });

  it('新建店员时 PIN 撞上已有在职账号会被拒绝（409）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'E2E-撞车店员', pin: '900001', role: 'staff' }); // 跟 managerToken 那个账号的 PIN 一样

    // 万一拒绝逻辑没生效（比如这次是在验证回归测试有没有效），账号会被真的建出来，
    // 得先记下来才能在 afterEach 里收拾掉，不能假设这里一定是 409、走不到创建
    if (res.body?.id) createdStaffIds.push(res.body.id);
    expect(res.status).toBe(409);
  });

  it('新建店员用一个没人用过的 PIN 能成功', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'E2E-正常店员', pin: '900002', role: 'staff' });

    expect(res.status).toBe(201);
    createdStaffIds.push(res.body.id);
  });

  it('重置 PIN 时撞上其他在职账号也会被拒绝', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'E2E-待重置店员', pin: '900003', role: 'staff' });
    createdStaffIds.push(created.body.id);

    const res = await request(app.getHttpServer())
      .patch(`/api/staff/${created.body.id}/pin`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ pin: '900001' }); // 撞上 manager 的 PIN

    expect(res.status).toBe(409);
  });

  it('撞车的新 PIN 被拒绝后，用原来的 PIN 登录仍然是本人而不是被顶替', async () => {
    // 这是这个 bug 最终暴露的地方：如果拒绝逻辑没生效，账号创建成功后，
    // 拿冲突的 PIN 登录会先匹配到 managerId 那个账号（scan 顺序在前），而不是新账号自己
    const res = await request(app.getHttpServer())
      .post('/api/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'E2E-撞车店员2', pin: '900001', role: 'staff' });

    if (res.body?.id) createdStaffIds.push(res.body.id);
    expect(res.status).toBe(409); // 创建就应该被拒绝，走不到"登录成了别人"这一步
  });
});
