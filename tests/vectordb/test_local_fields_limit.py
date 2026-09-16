# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0

import pytest

from openviking.storage.vectordb.collection.local_collection import (
    get_or_create_local_collection,
)
from openviking.storage.vectordb.store.bytes_row import STRING_MAX_UINT16_LENGTH
from openviking.storage.vectordb.store.data import CandidateData
from openviking.storage.vectordb.utils.json_safety import safe_json_dumps


@pytest.fixture
def collection():
    return get_or_create_local_collection(
        meta_data={
            "CollectionName": "abstract_limit",
            "Fields": [
                {"FieldName": "id", "FieldType": "string", "IsPrimaryKey": True},
                {"FieldName": "abstract", "FieldType": "string"},
                {"FieldName": "uri", "FieldType": "path"},
                {"FieldName": "account_id", "FieldType": "string"},
                {"FieldName": "owner_user_id", "FieldType": "string"},
                {"FieldName": "vector", "FieldType": "vector", "Dim": 4},
            ],
        }
    )


def record(abstract):
    return {
        "id": "memory-1",
        "abstract": abstract,
        "uri": "viking://user/alice/memories/events/example.md",
        "account_id": "tenant-1",
        "owner_user_id": "alice",
        "vector": [1.0, 0.0, 0.0, 0.0],
    }


@pytest.mark.parametrize(
    "text",
    ['"' * 50_000, "\x00\\\n" * 20_000, "部署😀" * 20_000],
    ids=["quotes", "escaped-controls", "multibyte"],
)
@pytest.mark.parametrize("operation", ["upsert", "update"])
def test_oversized_abstract_round_trips_with_metadata_and_vector(collection, text, operation):
    source = record(text)
    if operation == "update":
        collection.upsert_data([record("before")])
        collection.update_data([{"id": source["id"], "abstract": text}])
    else:
        collection.upsert_data([source])

    stored = collection.fetch_data([source["id"]]).items[0].fields
    abstract = stored["abstract"]
    assert abstract and len(abstract) < len(text)
    assert text.startswith(abstract)
    for key, value in source.items():
        if key != "abstract":
            assert stored[key] == value
    assert source["abstract"] == text

    fields = {key: value for key, value in stored.items() if key != "vector"}
    encoded = safe_json_dumps(fields, ensure_ascii=False)
    assert len(encoded.encode("utf-8")) <= STRING_MAX_UINT16_LENGTH
    CandidateData(fields=encoded).serialize()
    # The next whole character must exceed the exact serialized envelope budget.
    fields["abstract"] = text[: len(abstract) + 1]
    assert (
        len(safe_json_dumps(fields, ensure_ascii=False).encode("utf-8")) > STRING_MAX_UINT16_LENGTH
    )


def test_small_abstract_is_unchanged(collection):
    source = record('A short "summary" 部署😀')
    collection.upsert_data([source])
    assert collection.fetch_data([source["id"]]).items[0].fields == source


def test_oversized_metadata_is_rejected_without_corrupting_existing_record(collection):
    source = record("original")
    collection.upsert_data([source])
    with pytest.raises(ValueError, match="metadata.*65535"):
        collection.update_data(
            [{"id": source["id"], "account_id": "x" * 70_000, "abstract": "large" * 20_000}]
        )
    assert collection.fetch_data([source["id"]]).items[0].fields == source


def test_abstract_used_as_primary_key_is_never_truncated():
    collection = get_or_create_local_collection(
        meta_data={
            "CollectionName": "abstract_pk",
            "Fields": [
                {"FieldName": "abstract", "FieldType": "string", "IsPrimaryKey": True},
                {"FieldName": "vector", "FieldType": "vector", "Dim": 4},
            ],
        }
    )
    with pytest.raises(ValueError, match="metadata.*65535"):
        collection.upsert_data([{"abstract": '"' * 50_000, "vector": [1.0, 0.0, 0.0, 0.0]}])
