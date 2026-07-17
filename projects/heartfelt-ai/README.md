# Heartfelt AI

论文查重 + AI 检测 + 降AI 改写 全栈系统。

详细设计见 [`../../plan/project-overview.md`](../../plan/project-overview.md)。

## 目录

```
heartfelt-ai/
├── frontend/      React + Vite + Tailwind  (:5173)
├── backend/       NestJS                   (:3000)
├── ai-service/    FastAPI + PyTorch        (:8000)
├── shared/        共享类型 / OpenAPI
└── docker-compose.yml   PG + Redis + MinIO
```

## 快速启动

### 1. 基础设施（首次）

需要 Docker Desktop。启动 PG / Redis / MinIO：

```bash
docker compose up -d
```

### 2. 后端

```bash
cd backend
pnpm install
pnpm migration:run      # 首次建表
pnpm start:dev          # http://localhost:3000
```

健康检查：`GET http://localhost:3000/health`

### 3. AI Service

```bash
cd ai-service
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

健康检查：`GET http://localhost:8000/health`

### 4. 前端

```bash
cd frontend
pnpm install
pnpm dev                # http://localhost:5173
```

## 当前阶段：Phase 0（骨架）

- ✅ 四端骨架可启动
- ✅ 健康检查互通
- ⏳ 业务模块（查重 / AI 检测 / 降AI）待实现，见路线图
