import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import asyncpg


async def open_pool(dsn: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        dsn,
        min_size=1,
        max_size=5,
        init=_init_connection,
        # Supabase's transaction pooler (port 6543) can't use prepared statement caches.
        statement_cache_size=0,
    )


async def close_pool(pool: asyncpg.Pool) -> None:
    await pool.close()


@asynccontextmanager
async def transaction(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    """One connection inside one transaction: commits when the block exits, rolls back if it raises.
    Every repository call made with this connection is part of the same unit of work."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


async def _init_connection(conn: asyncpg.Connection) -> None:
    for pg_type in ("json", "jsonb"):
        await conn.set_type_codec(pg_type, encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
