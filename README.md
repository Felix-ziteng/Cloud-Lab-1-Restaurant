# Restaurant

餐厅点餐系统 V1。设计文档见 [docs/](docs/)：[PRD](docs/PRD.md)、[架构](docs/ARCHITECTURE.md)、[数据模型](docs/DATA_MODEL.md)、[接口设计](docs/API_DESIGN.md)。

## 项目结构

```
apps/
  backend/   NestJS + Prisma + PostgreSQL + WebSocket
  frontend/  React + Vite，顾客/前台/厨房共用一套代码，按路由区分角色视图
packages/
  shared-types/  前后端共享的 TypeScript 类型
```

## 本地开发

需要一个可访问的 PostgreSQL 实例（本地安装或容器均可，V1 部署形态见 [ARCHITECTURE.md](docs/ARCHITECTURE.md)）。

```bash
npm install

# 首次运行：配置数据库连接
cp apps/backend/.env.example apps/backend/.env
# 编辑 apps/backend/.env 中的 DATABASE_URL

# 构建共享类型包（backend/frontend 依赖它的编译产物）
npm run build --workspace=packages/shared-types

# 建表
npm run prisma:migrate --workspace=apps/backend

# 启动后端（http://localhost:3000/api）
npm run dev:backend

# 另开一个终端，启动前端（http://localhost:5173）
cp apps/frontend/.env.example apps/frontend/.env
npm run dev:frontend
```

## 现状

模块结构已按 [API_DESIGN.md](docs/API_DESIGN.md) 搭好（auth / tables / menu / orders / kitchen / delivery / reservations），核心的开台/加菜/提交/结账/权限校验流程已实现。前端目前只有路由骨架和最基础的登录/加载菜单逻辑，具体点餐/POS/KDS 界面待下一阶段开发。
