# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0
from pydantic import BaseModel, Field


class TransactionConfig(BaseModel):
    """Configuration for the transaction mechanism.

    By default, lock acquisition waits up to ``lock_timeout`` seconds
    (``lock_timeout=5``): if a conflicting lock is held the caller blocks
    and retries for up to 5 seconds before raising ``LockAcquisitionError``.
    Set ``lock_timeout=0`` to fail immediately, or increase it for
    high-contention workloads.
    """

    lock_timeout: float = Field(
        default=5.0,
        description=(
            "Path lock acquisition timeout (seconds). "
            "0 = fail immediately if locked. "
            "> 0 = wait/retry up to this many seconds before raising LockAcquisitionError (default: 5)."
        ),
    )

    lock_expire: float = Field(
        default=300.0,
        description=(
            "Stale lock expiry threshold (seconds). "
            "Locks held longer than this by a crashed process are force-released."
        ),
    )

    model_config = {"extra": "forbid"}
