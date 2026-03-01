# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0
"""OpenViking console package."""

from openviking.console.app import create_console_app
from openviking.console.config import ConsoleConfig, load_console_config

__all__ = ["create_console_app", "ConsoleConfig", "load_console_config"]
