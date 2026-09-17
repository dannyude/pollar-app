"""Persistence for the Pollar users Puente has seen."""

import asyncpg

from ..domain.models import User


async def upsert(conn: asyncpg.Connection, user: User) -> User:
    row = await conn.fetchrow(
        """insert into users (id, wallet, email) values ($1, $2, $3)
           on conflict (id) do update
             set wallet = excluded.wallet, email = coalesce(excluded.email, users.email), updated_at = now()
           returning id, wallet, email""",
        user.id,
        user.wallet,
        user.email,
    )
    return User(row["id"], row["wallet"], row["email"])


async def find(conn: asyncpg.Connection, *, user_id: str | None = None, email: str | None = None, wallet: str | None = None) -> User | None:
    column, value = ("id", user_id) if user_id else ("email", email) if email else ("wallet", wallet)
    row = await conn.fetchrow(f"select id, wallet, email from users where {column} = $1", value)
    return User(row["id"], row["wallet"], row["email"]) if row else None
