import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.services.simbad import resolve_target_name, normalize_object_name


def test_normalize_object_name():
    assert normalize_object_name("m 31") == "M 31"
    assert normalize_object_name("  ngc  224 ") == "NGC 224"
    assert normalize_object_name("IC1396") == "IC1396"
    assert normalize_object_name("Andromeda Galaxy") == "ANDROMEDA GALAXY"


class TestResolveTargetName:
    """Tests for SIMBAD resolution with mocked external API."""

    @pytest.mark.asyncio
    async def test_resolve_known_messier_object(self):
        mock_result = {
            "primary_name": "M 31",
            "aliases": ["M31", "NGC 224", "Andromeda Galaxy"],
            "ra": 10.6847,
            "dec": 41.2687,
            "object_type": "Galaxy",
        }
        with patch("app.services.simbad._query_simbad", new_callable=AsyncMock, return_value=mock_result):
            result = await resolve_target_name("m 31")

        assert result is not None
        assert result["primary_name"] == "M 31"
        assert "NGC 224" in result["aliases"]
        assert result["ra"] == pytest.approx(10.6847, abs=0.01)

    @pytest.mark.asyncio
    async def test_resolve_unknown_object_returns_none(self):
        with patch("app.services.simbad._query_simbad", new_callable=AsyncMock, return_value=None):
            result = await resolve_target_name("XYZNOTREAL123")
        assert result is None
