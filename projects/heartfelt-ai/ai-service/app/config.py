"""配置项，从环境变量读取。"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 服务端口（uvicorn 启动时通过 --port 传，这里仅文档化）
    ai_service_port: int = 8000

    # HuggingFace 模型缓存目录
    hf_home: str = "./models"
    hf_endpoint: str = "https://huggingface.co"

    # CORS：默认允许 backend 和 frontend 开发端口
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]


settings = Settings()
