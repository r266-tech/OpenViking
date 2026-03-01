# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0
"""Run the standalone console example service."""

import uvicorn

from openviking.console.app import create_console_app
from openviking.console.config import load_console_config


def main() -> None:
    config = load_console_config()
    app = create_console_app(config=config)
    uvicorn.run(app, host=config.host, port=config.port)


if __name__ == "__main__":
    main()
