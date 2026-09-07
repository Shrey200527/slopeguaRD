from dotenv import load_dotenv
import os

load_dotenv()


class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    ML_SERVICE_URL: str = os.getenv(
        "ML_SERVICE_URL",
        "http://127.0.0.1:8001"
    )


settings = Settings()

if not settings.DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")