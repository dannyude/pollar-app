from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

CIRCLE_USDC_ISSUER = {
    "testnet": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "mainnet": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
}

DEFAULT_HORIZON = {
    "testnet": "https://horizon-testnet.stellar.org",
    "mainnet": "https://horizon.stellar.org",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    pollar_secret_key: str | None = None
    pollar_server_api_url: str = "https://server.api.pollar.xyz"

    stellar_network: Literal["testnet", "mainnet"] = "testnet"
    horizon_url: str | None = None
    escrow_secret: str | None = None
    usdc_issuer: str | None = None

    cash_in_ttl_minutes: float = 30
    cash_out_ttl_minutes: float = 30
    payout_window_minutes: float = 120
    auto_complete_hours: float = 24
    # How often expiries, auto-completion and settling payouts are applied. 0 turns the loop off.
    maintenance_interval_seconds: float = 15

    # Comma-separated browser origins allowed to call the API.
    cors_origins: str = "http://localhost:3000"
    environment: str = "development"
    # Local testing only: accept `Authorization: Dev <userId> <G-address>`.
    dev_auth: bool = False

    @property
    def horizon(self) -> str:
        return self.horizon_url or DEFAULT_HORIZON[self.stellar_network]

    @property
    def usdc_issuer_address(self) -> str:
        return self.usdc_issuer or CIRCLE_USDC_ISSUER[self.stellar_network]

    @property
    def dev_auth_enabled(self) -> bool:
        return self.dev_auth and self.environment != "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # database_url comes from the environment
