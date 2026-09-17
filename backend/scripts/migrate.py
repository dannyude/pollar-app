"""Applies schema.sql (idempotent). Usage: python -m scripts.migrate"""

import asyncio
from pathlib import Path

import asyncpg

from app.config import settings

SCHEMA = Path(__file__).resolve().parent.parent / "schema.sql"


async def apply_schema(dsn: str) -> None:
    conn = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        await conn.execute(SCHEMA.read_text())
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(apply_schema(settings().database_url))
    print("Schema applied.")
