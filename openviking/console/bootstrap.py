# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0
"""Bootstrap entrypoint for OpenViking console service."""

from __future__ import annotations

import argparse

import uvicorn

from openviking.console.app import create_console_app
from openviking.console.config import load_console_config


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="OpenViking Console",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", type=str, default=None, help="Host to bind to")
    parser.add_argument("--port", type=int, default=None, help="Port to bind to")
    parser.add_argument(
        "--openviking-url",
        type=str,
        default=None,
        help="Base URL for OpenViking HTTP service",
    )
    parser.add_argument(
        "--write-enabled",
        action="store_true",
        help="Enable write operations in console proxy",
    )
    return parser


def main() -> None:
    """Run console service."""
    parser = _build_parser()
    args = parser.parse_args()

    config = load_console_config()
    if args.host is not None:
        config.host = args.host
    if args.port is not None:
        config.port = args.port
    if args.openviking_url is not None:
        config.openviking_base_url = args.openviking_url
    if args.write_enabled:
        config.write_enabled = True

    app = create_console_app(config=config)
    print(f"OpenViking Console is running on {config.host}:{config.port}")
    uvicorn.run(app, host=config.host, port=config.port)


if __name__ == "__main__":
    main()
