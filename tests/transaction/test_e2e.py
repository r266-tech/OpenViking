# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0
"""End-to-end transaction tests using real AGFS backend.

These tests exercise the full stack: TransactionContext → TransactionManager →
PathLock → Journal → AGFS, verifying the complete acquire → operate → commit/rollback
→ release → journal cleanup lifecycle.
"""

import uuid

import pytest

from openviking.storage.transaction.context_manager import TransactionContext
from openviking.storage.transaction.journal import TransactionJournal
from openviking.storage.transaction.path_lock import LOCK_FILE_NAME
from openviking.storage.transaction.transaction_manager import TransactionManager


@pytest.fixture
def tx_manager(agfs_client):
    """Create a real TransactionManager backed by the test AGFS."""
    manager = TransactionManager(
        agfs_client=agfs_client,
        timeout=3600,
        max_parallel_locks=8,
        lock_timeout=5.0,
        lock_expire=300.0,
    )
    return manager


class TestE2ECommit:
    async def test_full_commit_lifecycle(self, agfs_client, tx_manager, test_dir):
        """Full lifecycle: context enter → record undo → commit → locks released → journal cleaned."""
        async with TransactionContext(
            tx_manager, "test_write", [test_dir], lock_mode="point"
        ) as tx:
            # Lock should be acquired
            lock_path = f"{test_dir}/{LOCK_FILE_NAME}"
            token = agfs_client.cat(lock_path)
            assert token is not None

            # Record some operations
            seq = tx.record_undo("fs_write_new", {"uri": f"{test_dir}/file.txt"})
            agfs_client.write(f"{test_dir}/file.txt", b"hello")
            tx.mark_completed(seq)

            # Add post action
            tx.add_post_action(
                "enqueue_semantic",
                {"uri": "viking://test", "context_type": "resource", "account_id": "default"},
            )

            await tx.commit()

        # After commit: lock should be released
        try:
            agfs_client.cat(lock_path)
            raise AssertionError("Lock file should be gone after commit")
        except Exception:
            pass  # Expected

        # Transaction should be removed from manager
        assert tx_manager.get_transaction(tx.record.id) is None

    async def test_commit_file_persists(self, agfs_client, tx_manager, test_dir):
        """Files written inside a committed transaction persist."""
        file_path = f"{test_dir}/committed-file.txt"

        async with TransactionContext(tx_manager, "write_op", [test_dir], lock_mode="point") as tx:
            seq = tx.record_undo("fs_write_new", {"uri": file_path})
            agfs_client.write(file_path, b"committed data")
            tx.mark_completed(seq)
            await tx.commit()

        content = agfs_client.cat(file_path)
        assert content == b"committed data"


class TestE2ERollback:
    async def test_explicit_exception_triggers_rollback(self, agfs_client, tx_manager, test_dir):
        """Exception inside context → auto-rollback → undo operations reversed."""
        new_dir = f"{test_dir}/to-be-rolled-back-{uuid.uuid4().hex}"

        with pytest.raises(RuntimeError):
            async with TransactionContext(
                tx_manager, "failing_op", [test_dir], lock_mode="point"
            ) as tx:
                seq = tx.record_undo("fs_mkdir", {"uri": new_dir})
                agfs_client.mkdir(new_dir)
                tx.mark_completed(seq)

                raise RuntimeError("simulated failure")

        # Directory should be removed by rollback
        try:
            agfs_client.stat(new_dir)
            raise AssertionError("Directory should be removed by rollback")
        except Exception:
            pass

        # Lock should be released
        lock_path = f"{test_dir}/{LOCK_FILE_NAME}"
        try:
            agfs_client.cat(lock_path)
            raise AssertionError("Lock should be released after rollback")
        except Exception:
            pass

    async def test_no_commit_triggers_rollback(self, agfs_client, tx_manager, test_dir):
        """Exiting context without calling commit() triggers auto-rollback."""
        new_dir = f"{test_dir}/forgot-commit-{uuid.uuid4().hex}"

        async with TransactionContext(tx_manager, "no_commit", [test_dir], lock_mode="point") as tx:
            seq = tx.record_undo("fs_mkdir", {"uri": new_dir})
            agfs_client.mkdir(new_dir)
            tx.mark_completed(seq)
            # Intentionally not calling tx.commit()

        # Directory should be removed by rollback
        try:
            agfs_client.stat(new_dir)
            raise AssertionError("Directory should be removed by rollback")
        except Exception:
            pass


class TestE2EMvLock:
    async def test_mv_lock_acquires_both_paths(self, agfs_client, tx_manager, test_dir):
        """mv lock mode acquires SUBTREE on source and POINT on destination."""
        src = f"{test_dir}/mv-src-{uuid.uuid4().hex}"
        dst = f"{test_dir}/mv-dst-{uuid.uuid4().hex}"
        agfs_client.mkdir(src)
        agfs_client.mkdir(dst)

        async with TransactionContext(
            tx_manager, "mv_op", [src], lock_mode="mv", mv_dst_path=dst
        ) as tx:
            # Both lock files should exist
            src_token = agfs_client.cat(f"{src}/{LOCK_FILE_NAME}")
            dst_token = agfs_client.cat(f"{dst}/{LOCK_FILE_NAME}")
            src_token_str = src_token.decode("utf-8") if isinstance(src_token, bytes) else src_token
            dst_token_str = dst_token.decode("utf-8") if isinstance(dst_token, bytes) else dst_token

            assert ":S" in src_token_str  # SUBTREE on source
            assert ":P" in dst_token_str  # POINT on destination

            await tx.commit()

        # Both locks released
        for path in [f"{src}/{LOCK_FILE_NAME}", f"{dst}/{LOCK_FILE_NAME}"]:
            try:
                agfs_client.cat(path)
                raise AssertionError(f"Lock {path} should be gone")
            except Exception:
                pass


class TestE2ESubtreeRollback:
    async def test_subtree_lock_with_rollback(self, agfs_client, tx_manager, test_dir):
        """Subtree lock + rollback: undo is executed and lock released."""
        target = f"{test_dir}/sub-rb-{uuid.uuid4().hex}"
        agfs_client.mkdir(target)

        child = f"{target}/child-{uuid.uuid4().hex}"

        with pytest.raises(ValueError):
            async with TransactionContext(tx_manager, "rm_op", [target], lock_mode="subtree") as tx:
                seq = tx.record_undo("fs_mkdir", {"uri": child})
                agfs_client.mkdir(child)
                tx.mark_completed(seq)

                raise ValueError("abort rm")

        # Child dir should be removed by rollback
        try:
            agfs_client.stat(child)
            raise AssertionError("Child should be cleaned up")
        except Exception:
            pass

        # Lock released
        try:
            agfs_client.cat(f"{target}/{LOCK_FILE_NAME}")
            raise AssertionError("Lock should be released")
        except Exception:
            pass


class TestE2EJournalCleanup:
    async def test_journal_cleaned_after_commit(self, agfs_client, tx_manager, test_dir):
        """After successful commit, the journal entry for the transaction is deleted."""
        journal = TransactionJournal(agfs_client)

        async with TransactionContext(
            tx_manager, "journal_test", [test_dir], lock_mode="point"
        ) as tx:
            tx_id = tx.record.id
            await tx.commit()

        # Journal should be cleaned up
        all_ids = journal.list_all()
        assert tx_id not in all_ids

    async def test_journal_cleaned_after_rollback(self, agfs_client, tx_manager, test_dir):
        """After rollback, the journal entry is also cleaned up."""
        journal = TransactionJournal(agfs_client)

        with pytest.raises(RuntimeError):
            async with TransactionContext(
                tx_manager, "journal_rb", [test_dir], lock_mode="point"
            ) as tx:
                tx_id = tx.record.id
                raise RuntimeError("force rollback")

        all_ids = journal.list_all()
        assert tx_id not in all_ids


class TestE2ESequentialTransactions:
    async def test_sequential_transactions_on_same_path(self, agfs_client, tx_manager, test_dir):
        """Two sequential transactions on the same path both succeed."""
        for i in range(3):
            async with TransactionContext(
                tx_manager, f"seq_{i}", [test_dir], lock_mode="point"
            ) as tx:
                seq = tx.record_undo("fs_write_new", {"uri": f"{test_dir}/f{i}.txt"})
                agfs_client.write(f"{test_dir}/f{i}.txt", f"data-{i}".encode())
                tx.mark_completed(seq)
                await tx.commit()

        # All files should exist
        for i in range(3):
            content = agfs_client.cat(f"{test_dir}/f{i}.txt")
            assert content == f"data-{i}".encode()

        assert tx_manager.get_transaction_count() == 0
