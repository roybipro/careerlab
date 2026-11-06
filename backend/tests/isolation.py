"""Shared isolation check for every user-owned resource."""

from typing import Any

from fastapi.testclient import TestClient


def assert_isolated(
    owner_client: TestClient, other_client: TestClient, url: str, patch_body: dict[str, Any]
) -> None:
    """The other user gets 404 on GET, PATCH and DELETE, and the owner's record is unchanged."""
    before = owner_client.get(url)
    assert before.status_code == 200, before.text

    assert other_client.get(url).status_code == 404
    assert other_client.patch(url, json=patch_body).status_code == 404
    assert other_client.delete(url).status_code == 404

    after = owner_client.get(url)
    assert after.status_code == 200
    assert after.json() == before.json()
