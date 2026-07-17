# Heartfelt AI · AI Service

Python FastAPI 微服务，负责模型推理：文本向量化、困惑度计算、AI 文本检测、向量库检索。

## 启动

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

健康检查：`GET http://localhost:8000/health`

## 模型依赖

当前骨架阶段**不下载任何 HuggingFace 模型**。实现具体路由时按需启用 extras：

| 路由 | 需要的模型 | 启用方式 |
|---|---|---|
| `POST /embed` | `BAAI/bge-base-zh-v1.5` (~400MB) | `uv sync --extra embed` |
| `POST /perplexity` | `uer/gpt2-chinese-cluecorpussmall` (~500MB) | `uv sync --extra embed` |
| `POST /detect-ai` | `Hello-SimpleAI/chatgpt-detector-roberta` (~500MB) | `uv sync --extra detect` |
| `POST /semantic-search` | 依赖 pgvector | `uv sync --extra vector-store` |

首次启动会自动下载模型到 `./models/`（设置 `HF_HOME=./models`）。

## 路由一览

| 方法 | 路径 | 状态 |
|---|---|---|
| GET | `/health` | ✅ 已实现 |
| POST | `/embed` | ⏳ 待实现（v1） |
| POST | `/perplexity` | ⏳ 待实现（v1） |
| POST | `/detect-ai` | ⏳ 待实现（v2） |
| POST | `/semantic-search` | ⏳ 待实现（v1） |
