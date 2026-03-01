# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0
"""Configuration for the standalone OpenViking console service."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Iterable, List


def _parse_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    lowered = value.strip().lower()
    return lowered in {"1", "true", "yes", "on"}


def _parse_cors_origins(raw_value: str | None) -> List[str]:
    if not raw_value:
        return ["*"]
    return [item.strip() for item in raw_value.split(",") if item.strip()]


@dataclass(slots=True)
class ConsoleConfig:
    """Runtime settings for console BFF + static frontend."""

    host: str = "127.0.0.1"
    port: int = 1989
    openviking_base_url: str = "http://127.0.0.1:1933"
    write_enabled: bool = False
    request_timeout_sec: float = 30.0
    cors_origins: List[str] = field(default_factory=lambda: ["*"])

    def normalized_base_url(self) -> str:
        """Return upstream base URL without trailing slash."""
        return self.openviking_base_url.rstrip("/")


def load_console_config() -> ConsoleConfig:
    """Load console config from environment variables."""
    return ConsoleConfig(
        host=os.getenv("CONSOLE_HOST", "127.0.0.1"),
        port=int(os.getenv("CONSOLE_PORT", "1989")),
        openviking_base_url=os.getenv("OPENVIKING_BASE_URL", "http://127.0.0.1:1933"),
        write_enabled=_parse_bool(os.getenv("CONSOLE_WRITE_ENABLED"), False),
        request_timeout_sec=float(os.getenv("CONSOLE_REQUEST_TIMEOUT_SEC", "30")),
        cors_origins=_parse_cors_origins(os.getenv("CONSOLE_CORS_ORIGINS")),
    )


def as_runtime_capabilities(config: ConsoleConfig) -> dict:
    """Expose runtime behavior switches for UI gating."""
    allowed_modules: Iterable[str] = [
        "fs.read",
        "search.find",
        "admin.read",
        "monitor.read",
    ]
    if config.write_enabled:
        allowed_modules = [*allowed_modules, "fs.write", "admin.write", "resources.write"]

    return {
        "write_enabled": config.write_enabled,
        "allowed_modules": list(allowed_modules),
        "dangerous_actions": [
            "fs.mkdir",
            "fs.mv",
            "fs.rm",
            "admin.create_account",
            "admin.delete_account",
            "admin.create_user",
            "admin.delete_user",
            "admin.set_role",
            "admin.regenerate_key",
            "resources.add_resource",
        ],
    }
