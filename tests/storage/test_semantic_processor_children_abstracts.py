# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: Apache-2.0

"""Keep not-ready abstract placeholders out of parent overview prompts.

Regression coverage for volcengine/OpenViking#2434: leaf directories without a
generated ``.abstract.md`` return a ``[Directory abstract is not ready]``
placeholder, which was previously fed verbatim into the parent directory's
overview-generation prompt (and thus polluted the generated, persisted and
vectorized summaries).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from openviking.storage.viking_fs import (
    ABSTRACT_FILE_NOT_READY_MARKER,
    ABSTRACT_NOT_READY_MARKER,
    OVERVIEW_NOT_READY_MARKER,
    is_placeholder_abstract,
)


class TestIsPlaceholderAbstract:
    @pytest.mark.parametrize(
        "text",
        [
            # Exact emitted shapes (see VikingFS._read_abstract_file / overview /
            # _batch_fetch_abstracts and SemanticProcessor._generate_overview).
            ABSTRACT_FILE_NOT_READY_MARKER,
            f"# viking://user/default/memories/entities/foo {ABSTRACT_NOT_READY_MARKER}",
            f"# foo\n\n{OVERVIEW_NOT_READY_MARKER}",
            # Tolerate surrounding whitespace.
            f"  # foo\n\n{OVERVIEW_NOT_READY_MARKER}\n",
        ],
    )
    def test_detects_placeholders(self, text: str) -> None:
        assert is_placeholder_abstract(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "# foo\n\nThis directory stores development-tool entities.",
            "A real abstract about tooling and related notes.",
            "",
            # A real abstract that merely MENTIONS a marker phrase in prose must
            # NOT be filtered (would otherwise be silent data loss).
            f"# notes\n\nThis directory documents the {ABSTRACT_NOT_READY_MARKER} "
            "placeholder and how it is generated.",
            f"The abstract explains why {ABSTRACT_FILE_NOT_READY_MARKER} can surface.",
        ],
    )
    def test_passes_real_content(self, text: str) -> None:
        assert is_placeholder_abstract(text) is False


class TestCollectChildrenAbstractsFiltersPlaceholders:
    @pytest.mark.asyncio
    async def test_placeholders_excluded(self) -> None:
        from openviking.storage.queuefs.semantic_processor import SemanticProcessor

        abstracts = {
            "viking://u/d/ready_a": "# ready_a\n\nReal summary A.",
            "viking://u/d/not_ready": (
                "# viking://u/d/not_ready [Directory abstract is not ready]"
            ),
            "viking://u/d/ready_b": "# ready_b\n\nReal summary B.",
            "viking://u/d/no_md": ABSTRACT_FILE_NOT_READY_MARKER,
        }

        mock_fs = MagicMock()
        mock_fs.abstract = AsyncMock(side_effect=lambda uri, ctx=None: abstracts[uri])

        with patch(
            "openviking.storage.queuefs.semantic_processor.get_viking_fs",
            return_value=mock_fs,
        ):
            processor = SemanticProcessor()
            results = await processor._collect_children_abstracts(list(abstracts.keys()))

        # Only children with a real generated abstract survive.
        assert {item["name"] for item in results} == {"ready_a", "ready_b"}
        # And nothing that survives is a placeholder.
        assert all(not is_placeholder_abstract(item["abstract"]) for item in results)

    @pytest.mark.asyncio
    async def test_all_placeholders_yields_empty(self) -> None:
        # Boundary: when every child is not-ready, the result is empty. The
        # overview generator already handles empty children_abstracts ("None"),
        # which is strictly better than feeding placeholder text into the prompt.
        from openviking.storage.queuefs.semantic_processor import SemanticProcessor

        abstracts = {
            "viking://u/d/a": f"# viking://u/d/a {ABSTRACT_NOT_READY_MARKER}",
            "viking://u/d/b": ABSTRACT_FILE_NOT_READY_MARKER,
        }
        mock_fs = MagicMock()
        mock_fs.abstract = AsyncMock(side_effect=lambda uri, ctx=None: abstracts[uri])

        with patch(
            "openviking.storage.queuefs.semantic_processor.get_viking_fs",
            return_value=mock_fs,
        ):
            processor = SemanticProcessor()
            results = await processor._collect_children_abstracts(list(abstracts.keys()))

        assert results == []
