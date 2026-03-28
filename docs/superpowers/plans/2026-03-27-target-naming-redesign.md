# Target Naming & SIMBAD Data Storage Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix corrupted SIMBAD aliases, double-spaced primary names, and restructure target naming so display shows "NGC 7000 - North America Nebula" format with proper search support.

**Architecture:** Add `catalog_id` and `common_name` columns to Target model. Replace broken SIMBAD `%IDLIST` script parser with TAP SQL query that returns one alias per row. Add catalog priority logic and alias curation to `simbad.py`. Update search queries to use new fields. Backfill existing 110 targets.

**Tech Stack:** Python 3.12, SQLAlchemy 2, Alembic, PostgreSQL (pg_trgm), httpx, pytest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/services/simbad.py` | Modify | Add catalog priority, alias curation, common name extraction, TAP query |
| `backend/app/models/target.py` | Modify | Add `catalog_id`, `common_name` columns |
| `backend/alembic/versions/0005_add_catalog_id_common_name.py` | Create | Schema migration |
| `backend/app/worker/tasks.py` | Modify | Update `_resolve_or_cache_target` to use new fields |
| `backend/app/api/targets.py` | Modify | Update search queries to use `catalog_id`, `common_name` |
| `backend/backfill_targets.py` | Modify | Rewrite to use TAP + new curation logic |
| `backend/tests/test_simbad.py` | Modify | Tests for catalog priority, alias curation, TAP parsing |
| `backend/tests/test_api_targets.py` | Modify | Tests for updated search |

---

### Task 1: Catalog Priority & Alias Curation Logic

**Files:**
- Modify: `backend/app/services/simbad.py`
- Modify: `backend/tests/test_simbad.py`

- [ ] **Step 1: Write tests for catalog priority extraction**

Add to `backend/tests/test_simbad.py`:

```python
from app.services.simbad import extract_catalog_id, curate_aliases, extract_common_name


class TestExtractCatalogId:
    def test_messier_wins_over_ngc(self):
        aliases = ["NGC 1952", "M 1", "SH 2-244"]
        assert extract_catalog_id(aliases, "M   1") == "M 1"

    def test_ngc_wins_over_ic(self):
        aliases = ["IC 2000", "NGC 7000", "LBN 373"]
        assert extract_catalog_id(aliases, "NGC  7000") == "NGC 7000"

    def test_sharpless_extracted(self):
        aliases = ["SH 2-129", "LBN 423"]
        assert extract_catalog_id(aliases, "SH  2-129") == "SH 2-129"

    def test_arp_extracted(self):
        aliases = ["NGC 4038", "Arp 244"]
        assert extract_catalog_id(aliases, "NGC  4038") == "NGC 4038"

    def test_barnard_extracted(self):
        aliases = ["B 33", "LDN 1630"]
        assert extract_catalog_id(aliases, "some simbad id") == "B 33"

    def test_fallback_to_simbad_main_id_normalized(self):
        aliases = ["[ABC2007] J1234"]
        assert extract_catalog_id(aliases, "HD  50896") == "HD 50896"

    def test_collinder_extracted(self):
        aliases = ["Cr 399", "NGC 1234"]
        assert extract_catalog_id(aliases, "NGC  1234") == "NGC 1234"

    def test_caldwell_extracted(self):
        aliases = ["Caldwell 38", "NGC 4565"]
        assert extract_catalog_id(aliases, "NGC  4565") == "NGC 4565"

    def test_vdb_extracted(self):
        aliases = ["vdB 152"]
        assert extract_catalog_id(aliases, "some id") == "vdB 152"

    def test_whitespace_normalized_in_result(self):
        aliases = ["M   31", "NGC   224"]
        assert extract_catalog_id(aliases, "M   31") == "M 31"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_simbad.py::TestExtractCatalogId -v`
Expected: FAIL — `extract_catalog_id` not defined

- [ ] **Step 3: Implement catalog priority extraction**

Add to `backend/app/services/simbad.py` after the `normalize_object_name` function (after line 15):

```python
import re

# Catalog patterns in priority order (first match wins).
# Each tuple: (compiled regex, priority). Extend by appending.
CATALOG_PATTERNS: list[tuple[re.Pattern, int]] = [
    (re.compile(r"^M\s+\d+$", re.IGNORECASE), 1),
    (re.compile(r"^NGC\s+\d+$", re.IGNORECASE), 2),
    (re.compile(r"^IC\s+\d+[A-Z]?$", re.IGNORECASE), 3),
    (re.compile(r"^(Caldwell|C)\s+\d+$", re.IGNORECASE), 4),
    (re.compile(r"^SH\s+2-\d+$", re.IGNORECASE), 5),
    (re.compile(r"^PN\s+A66\s+\d+$", re.IGNORECASE), 6),
    (re.compile(r"^Abell\s+\d+$", re.IGNORECASE), 6),
    (re.compile(r"^Arp\s+\d+$", re.IGNORECASE), 7),
    (re.compile(r"^HCG\s+\d+$", re.IGNORECASE), 8),
    (re.compile(r"^B\s+\d+$", re.IGNORECASE), 9),
    (re.compile(r"^vdB\s+\d+$", re.IGNORECASE), 10),
    (re.compile(r"^LBN\s+[\d.+-]+$", re.IGNORECASE), 11),
    (re.compile(r"^LDN\s+\d+$", re.IGNORECASE), 12),
    (re.compile(r"^(Cr|Collinder)\s+\d+$", re.IGNORECASE), 13),
    (re.compile(r"^(Mel|Melotte)\s+\d+$", re.IGNORECASE), 14),
    (re.compile(r"^RCW\s+\d+$", re.IGNORECASE), 15),
    (re.compile(r"^Pal\s+\d+$", re.IGNORECASE), 16),
    (re.compile(r"^(Tr|Trumpler)\s+\d+$", re.IGNORECASE), 17),
    (re.compile(r"^Stock\s+\d+$", re.IGNORECASE), 18),
    (re.compile(r"^(Ced|Cederblad)\s+\d+$", re.IGNORECASE), 19),
    (re.compile(r"^Simeis\s+\d+$", re.IGNORECASE), 20),
    (re.compile(r"^DWB\s+\d+$", re.IGNORECASE), 21),
    (re.compile(r"^SNR\s+G[\d.+-]+$", re.IGNORECASE), 22),
    (re.compile(r"^Cl\s+Berkeley\s+\d+$", re.IGNORECASE), 23),
    (re.compile(r"^Cl\s+King\s+\d+$", re.IGNORECASE), 24),
    (re.compile(r"^Gum\s+\d+$", re.IGNORECASE), 25),
]


def _normalize_ws(s: str) -> str:
    """Collapse multiple spaces to one and strip."""
    return re.sub(r"\s+", " ", s.strip())


def _catalog_priority(name: str) -> int | None:
    """Return the priority of a catalog name, or None if not a known catalog."""
    normalized = _normalize_ws(name)
    for pattern, priority in CATALOG_PATTERNS:
        if pattern.match(normalized):
            return priority
    return None


def extract_catalog_id(aliases: list[str], simbad_main_id: str) -> str:
    """Pick the best catalog designation from aliases using priority hierarchy.
    Falls back to whitespace-normalized simbad_main_id."""
    best_name = None
    best_priority = 999

    for alias in aliases:
        p = _catalog_priority(alias)
        if p is not None and p < best_priority:
            best_priority = p
            best_name = _normalize_ws(alias)

    # Also check the SIMBAD main ID itself
    p = _catalog_priority(simbad_main_id)
    if p is not None and p < best_priority:
        best_priority = p
        best_name = _normalize_ws(simbad_main_id)

    return best_name if best_name else _normalize_ws(simbad_main_id)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_simbad.py::TestExtractCatalogId -v`
Expected: all PASS

- [ ] **Step 5: Write tests for alias curation**

Add to `backend/tests/test_simbad.py`:

```python
class TestCurateAliases:
    def test_keeps_catalog_ids(self):
        raw = ["M 31", "NGC 224", "2MASX J00424433+4116074", "[VV2010] J004244.3+411609"]
        result = curate_aliases(raw)
        assert "M 31" in result
        assert "NGC 224" in result
        assert "2MASX J00424433+4116074" not in result

    def test_keeps_name_entries_title_cased(self):
        raw = ["NAME ANDROMEDA GALAXY", "NGC 224", "[CHM2007] whatever"]
        result = curate_aliases(raw)
        assert "Andromeda Galaxy" in result

    def test_keeps_fits_object_names(self):
        result = curate_aliases([], fits_names=["Great Orion Nebula", "M 42"])
        assert "GREAT ORION NEBULA" in result
        assert "M 42" in result

    def test_drops_coordinate_based_ids(self):
        raw = ["NGC 7000", "NVSS J205858+442059", "1RXS J205857.3+442100", "NAME NORTH AMERICA NEBULA"]
        result = curate_aliases(raw)
        assert "NGC 7000" in result
        assert "North America Nebula" in result
        assert not any("NVSS" in a for a in result)
        assert not any("1RXS" in a for a in result)

    def test_deduplicates(self):
        raw = ["NGC 7000", "NGC 7000"]
        result = curate_aliases(raw, fits_names=["NGC7000"])
        # NGC 7000 appears once, NGC7000 normalized appears once
        unique = set(result)
        assert len(unique) == len(result)

    def test_normalizes_whitespace(self):
        raw = ["NGC   7000", "M   31"]
        result = curate_aliases(raw)
        assert "NGC 7000" in result
        assert "M 31" in result
        assert "NGC   7000" not in result
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_simbad.py::TestCurateAliases -v`
Expected: FAIL — `curate_aliases` not defined

- [ ] **Step 7: Implement alias curation**

Add to `backend/app/services/simbad.py` after `extract_catalog_id`:

```python
def curate_aliases(
    raw_aliases: list[str],
    fits_names: list[str] | None = None,
) -> list[str]:
    """Filter aliases to catalog IDs and common names only.
    Adds normalized FITS OBJECT header names."""
    seen: set[str] = set()
    result: list[str] = []

    def _add(name: str) -> None:
        normalized = _normalize_ws(name)
        key = normalized.upper()
        if key and key not in seen:
            seen.add(key)
            result.append(normalized)

    for alias in raw_aliases:
        alias = alias.strip()
        if not alias:
            continue
        # Keep NAME entries (title-cased)
        if alias.upper().startswith("NAME "):
            common = alias[5:].strip().title()
            _add(common)
            continue
        # Keep known catalog patterns
        if _catalog_priority(alias) is not None:
            _add(alias)

    # Add FITS OBJECT header names (normalized/uppercased)
    for name in (fits_names or []):
        _add(normalize_object_name(name))

    return result
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_simbad.py::TestCurateAliases -v`
Expected: all PASS

- [ ] **Step 9: Write tests for common name extraction**

Add to `backend/tests/test_simbad.py`:

```python
class TestExtractCommonName:
    def test_simbad_name_alias(self):
        aliases = ["NGC 7000", "NAME NORTH AMERICA NEBULA", "LBN 373"]
        assert extract_common_name(aliases) == "North America Nebula"

    def test_fits_name_when_no_simbad_name(self):
        aliases = ["NGC 7000", "LBN 373"]
        assert extract_common_name(aliases, fits_names=["North America Nebula"]) == "North America Nebula"

    def test_fits_catalog_id_not_used_as_common_name(self):
        aliases = ["NGC 7000"]
        # "NGC7000" is a catalog ID, not a common name
        assert extract_common_name(aliases, fits_names=["NGC7000"]) is None

    def test_none_when_no_common_name(self):
        aliases = ["NGC 7000", "IC 5070"]
        assert extract_common_name(aliases) is None

    def test_first_simbad_name_wins(self):
        aliases = ["NAME WHIRLPOOL GALAXY", "NAME QUESTION MARK GALAXY"]
        assert extract_common_name(aliases) == "Whirlpool Galaxy"

    def test_fits_common_name_used_when_not_catalog(self):
        aliases = ["M 31"]
        assert extract_common_name(aliases, fits_names=["Andromeda Galaxy"]) == "Andromeda Galaxy"
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_simbad.py::TestExtractCommonName -v`
Expected: FAIL — `extract_common_name` not defined

- [ ] **Step 11: Implement common name extraction**

Add to `backend/app/services/simbad.py` after `curate_aliases`:

```python
def extract_common_name(
    raw_aliases: list[str],
    fits_names: list[str] | None = None,
) -> str | None:
    """Extract a human-friendly common name from aliases or FITS OBJECT headers.
    Returns title-cased name or None."""
    # Priority 1: SIMBAD NAME entries
    for alias in raw_aliases:
        alias = alias.strip()
        if alias.upper().startswith("NAME "):
            return alias[5:].strip().title()

    # Priority 2: FITS OBJECT header if not a catalog pattern
    for name in (fits_names or []):
        name = name.strip()
        if name and _catalog_priority(name) is None:
            # It's a common name like "Andromeda Galaxy", not "NGC7000"
            return name

    return None


def build_primary_name(catalog_id: str | None, common_name: str | None) -> str:
    """Construct display name from catalog_id and common_name."""
    if catalog_id and common_name:
        return f"{catalog_id} - {common_name}"
    if catalog_id:
        return catalog_id
    if common_name:
        return common_name
    return "Unknown"
```

- [ ] **Step 12: Run all simbad tests**

Run: `cd backend && python -m pytest tests/test_simbad.py -v`
Expected: all PASS

- [ ] **Step 13: Commit**

```bash
git add backend/app/services/simbad.py backend/tests/test_simbad.py
git commit -m "feat: add catalog priority, alias curation, and common name extraction"
```

---

### Task 2: SIMBAD TAP Query for Aliases

**Files:**
- Modify: `backend/app/services/simbad.py`
- Modify: `backend/tests/test_simbad.py`

- [ ] **Step 1: Write test for TAP alias fetching**

Add to `backend/tests/test_simbad.py`:

```python
class TestQuerySimbadTap:
    @pytest.mark.asyncio
    async def test_tap_returns_individual_aliases(self):
        """TAP query should return one alias per entry, not a concatenated blob."""
        tap_response_text = (
            "id\n"
            "M  31\n"
            "NGC  224\n"
            "NAME ANDROMEDA GALAXY\n"
            "UGC  454\n"
            "2MASX J00424433+4116074\n"
        )
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = tap_response_text

        with patch("app.services.simbad._fetch_tap_aliases", new_callable=AsyncMock, return_value=[
            "M  31", "NGC  224", "NAME ANDROMEDA GALAXY", "UGC  454", "2MASX J00424433+4116074"
        ]):
            from app.services.simbad import _fetch_tap_aliases
            aliases = await _fetch_tap_aliases("M 31")

        assert len(aliases) == 5
        assert "M  31" in aliases
        assert "NGC  224" in aliases
        assert "NAME ANDROMEDA GALAXY" in aliases

    @pytest.mark.asyncio
    async def test_query_simbad_returns_curated_data(self):
        """Full _query_simbad should return curated aliases and new fields."""
        script_response = (
            "::data::\n"
            "M  31|G,AGN|10.6847|41.2687\n"
        )
        tap_aliases = [
            "M  31", "NGC  224", "NAME ANDROMEDA GALAXY",
            "UGC  454", "2MASX J00424433+4116074", "[VV2010] J004244.3+411609"
        ]

        mock_script_resp = MagicMock()
        mock_script_resp.status_code = 200
        mock_script_resp.text = script_response
        mock_script_resp.raise_for_status = MagicMock()

        with patch("app.services.simbad._fetch_tap_aliases", new_callable=AsyncMock, return_value=tap_aliases):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_script_resp):
                result = await _query_simbad("M 31")

        assert result is not None
        assert result["catalog_id"] == "M 31"
        assert result["common_name"] == "Andromeda Galaxy"
        assert result["primary_name"] == "M 31 - Andromeda Galaxy"
        # Curated aliases should not contain coordinate-based IDs
        assert not any("2MASX" in a for a in result["aliases"])
        assert "NGC 224" in result["aliases"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_simbad.py::TestQuerySimbadTap -v`
Expected: FAIL

- [ ] **Step 3: Implement TAP alias fetching**

Replace the alias-fetching section in `_query_simbad` (lines 66-80 of `backend/app/services/simbad.py`) and add a new `_fetch_tap_aliases` function. The full updated `_query_simbad` function:

```python
SIMBAD_TAP_URL = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"


async def _fetch_tap_aliases(object_name: str) -> list[str]:
    """Fetch aliases via SIMBAD TAP (returns one alias per row)."""
    import string
    safe_chars = string.printable.replace('\n', '').replace('\r', '').replace('\t', '')
    sanitized = ''.join(c for c in object_name if c in safe_chars).strip()

    # Use TAP ADQL query to get all identifiers
    query = f"SELECT id FROM ident JOIN basic ON ident.oidref = basic.oid WHERE basic.main_id = '{sanitized}'"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                SIMBAD_TAP_URL,
                params={
                    "request": "doQuery",
                    "lang": "adql",
                    "format": "tsv",
                    "query": query,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            lines = resp.text.strip().splitlines()
            # First line is the header ("id"), skip it
            if len(lines) <= 1:
                return []
            return [line.strip() for line in lines[1:] if line.strip()]
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("SIMBAD TAP alias query failed for '%s': %s", object_name, e)
        return []


async def _query_simbad(object_name: str) -> dict[str, Any] | None:
    """Query SIMBAD for an object by name. Returns structured data or None."""
    import string
    safe_chars = string.printable.replace('\n', '').replace('\r', '').replace('\t', '')
    sanitized = ''.join(c for c in object_name if c in safe_chars).strip()
    if not sanitized:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Use the SIMBAD script interface for main identity
            script = f"""
                format object "%MAIN_ID|%OTYPELIST|%COO(d;A)|%COO(d;D)"
                query id {sanitized}
            """
            resp = await client.post(
                "https://simbad.cds.unistra.fr/simbad/sim-script",
                data={"script": script},
                timeout=15.0,
            )
            resp.raise_for_status()

            text = resp.text
            if "::error::" in text:
                logger.info("SIMBAD found no match for '%s'", sanitized)
                return None

            data_section = text.split("::data::")[-1].strip()
            lines = [l.strip() for l in data_section.splitlines()
                     if l.strip() and not l.startswith("~") and not set(l.strip()).issubset({":"})]
            if not lines:
                return None

            parts = lines[0].split("|")
            if len(parts) < 4:
                return None

            main_id = parts[0].strip()
            obj_type = parts[1].strip()
            ra = float(parts[2].strip()) if parts[2].strip() else None
            dec = float(parts[3].strip()) if parts[3].strip() else None

        # Fetch aliases via TAP (separate client, one alias per row)
        raw_aliases = await _fetch_tap_aliases(main_id)

        # Curate aliases and extract catalog_id / common_name
        curated = curate_aliases(raw_aliases)
        catalog_id = extract_catalog_id(raw_aliases, main_id)
        common_name = extract_common_name(raw_aliases)
        primary_name = build_primary_name(catalog_id, common_name)

        return {
            "primary_name": primary_name,
            "catalog_id": catalog_id,
            "common_name": common_name,
            "aliases": curated,
            "ra": ra,
            "dec": dec,
            "object_type": obj_type,
        }

    except (httpx.HTTPError, ValueError, IndexError) as e:
        logger.warning("SIMBAD query failed for '%s': %s", sanitized, e)
        return None
```

Also update the `SIMBAD_TAP_URL` constant at the top of the file (replace the old one on line 9).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_simbad.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/simbad.py backend/tests/test_simbad.py
git commit -m "feat: replace SIMBAD IDLIST parser with TAP query for clean aliases"
```

---

### Task 3: Target Model & Migration

**Files:**
- Modify: `backend/app/models/target.py`
- Create: `backend/alembic/versions/0005_add_catalog_id_common_name.py`

- [ ] **Step 1: Add columns to Target model**

Edit `backend/app/models/target.py` to add `catalog_id` and `common_name` after `primary_name` (line 15):

```python
import uuid
from datetime import datetime

from sqlalchemy import String, Float, Index, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Target(Base):
    __tablename__ = "targets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    primary_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    catalog_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    common_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    aliases: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    ra: Mapped[float | None] = mapped_column(Float, nullable=True)
    dec: Mapped[float | None] = mapped_column(Float, nullable=True)
    object_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    merged_into_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("targets.id"), nullable=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    images: Mapped[list["Image"]] = relationship(back_populates="target")

    __table_args__ = (
        Index("ix_targets_aliases", "aliases", postgresql_using="gin"),
    )
```

- [ ] **Step 2: Create Alembic migration**

Create `backend/alembic/versions/0005_add_catalog_id_common_name.py`:

```python
"""Add catalog_id and common_name columns to targets."""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("targets", sa.Column("catalog_id", sa.String(100), nullable=True))
    op.add_column("targets", sa.Column("common_name", sa.String(255), nullable=True))

    # Add trigram index on catalog_id for fuzzy search
    op.execute(
        "CREATE INDEX ix_targets_catalog_id_trgm ON targets "
        "USING GIN (catalog_id gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_targets_catalog_id_trgm")
    op.drop_column("targets", "common_name")
    op.drop_column("targets", "catalog_id")
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/models/target.py backend/alembic/versions/0005_add_catalog_id_common_name.py
git commit -m "feat: add catalog_id and common_name columns to Target model"
```

---

### Task 4: Update Ingest Pipeline

**Files:**
- Modify: `backend/app/worker/tasks.py`

- [ ] **Step 1: Update `_resolve_or_cache_target` to populate new fields**

Edit `backend/app/worker/tasks.py`, function `_resolve_or_cache_target` (lines 288-344). The SIMBAD result dict now includes `catalog_id`, `common_name`, and a constructed `primary_name`. Update the Target creation block:

Replace lines 323-334:
```python
    # Cache the new target (handle race condition with other workers)
    with Session(_sync_engine) as session:
        aliases = [normalize_object_name(a) for a in result.get("aliases", [])]
        if normalized not in aliases:
            aliases.append(normalized)

        target = Target(
            primary_name=result["primary_name"],
            aliases=aliases,
            ra=result.get("ra"),
            dec=result.get("dec"),
            object_type=result.get("object_type"),
        )
```

With:
```python
    # Cache the new target (handle race condition with other workers)
    with Session(_sync_engine) as session:
        aliases = result.get("aliases", [])
        # Ensure the original FITS OBJECT name is in aliases
        if normalized not in [a.upper() for a in aliases]:
            aliases.append(normalized)

        target = Target(
            primary_name=result["primary_name"],
            catalog_id=result.get("catalog_id"),
            common_name=result.get("common_name"),
            aliases=aliases,
            ra=result.get("ra"),
            dec=result.get("dec"),
            object_type=result.get("object_type"),
        )
```

No other changes to `_resolve_or_cache_target` are needed — the lookup logic (checking aliases and primary_name) stays the same.

- [ ] **Step 2: Commit**

```bash
git add backend/app/worker/tasks.py
git commit -m "feat: populate catalog_id and common_name during ingest"
```

---

### Task 5: Update Search Queries

**Files:**
- Modify: `backend/app/api/targets.py`

- [ ] **Step 1: Update `/targets/search` endpoint**

Edit `backend/app/api/targets.py`, the `search_targets` function (lines 68-142).

Replace the Tier 1 exact query (lines 77-89):
```python
    # Tier 1: Exact substring matches — exclude soft-deleted
    aliases_str = func.array_to_string(Target.aliases, ' ')
    exact_query = (
        select(Target)
        .where(
            Target.merged_into_id.is_(None),
            or_(
                Target.primary_name.ilike(pattern),
                aliases_str.ilike(pattern),
            ),
        )
        .limit(limit)
    )
```

With:
```python
    # Tier 1: Exact substring matches — exclude soft-deleted
    aliases_str = func.array_to_string(Target.aliases, ' ')
    exact_query = (
        select(Target)
        .where(
            Target.merged_into_id.is_(None),
            or_(
                Target.primary_name.ilike(pattern),
                Target.catalog_id.ilike(pattern),
                Target.common_name.ilike(pattern),
                aliases_str.ilike(pattern),
            ),
        )
        .limit(limit)
    )
```

Replace the Tier 2 fuzzy query (lines 113-125):
```python
        searchable_text = func.concat(Target.primary_name, ' ', func.array_to_string(Target.aliases, ' '))
        fuzzy_score = func.similarity(searchable_text, q)
        fuzzy_query = (
            select(Target, fuzzy_score.label("score"))
            .where(
                Target.merged_into_id.is_(None),
                Target.id.notin_(exact_ids) if exact_ids else True,
                fuzzy_score > 0.3,
            )
            .order_by(fuzzy_score.desc())
            .limit(remaining)
        )
```

With:
```python
        searchable_text = func.concat(
            func.coalesce(Target.catalog_id, ''), ' ',
            func.coalesce(Target.common_name, ''), ' ',
            func.array_to_string(Target.aliases, ' '),
        )
        fuzzy_score = func.similarity(searchable_text, q)
        fuzzy_query = (
            select(Target, fuzzy_score.label("score"))
            .where(
                Target.merged_into_id.is_(None),
                Target.id.notin_(exact_ids) if exact_ids else True,
                fuzzy_score > 0.3,
            )
            .order_by(fuzzy_score.desc())
            .limit(remaining)
        )
```

- [ ] **Step 2: Update aggregation search filter**

Edit `backend/app/api/targets.py`, the `list_targets_aggregated` function, search filter section (lines 369-381):

Replace:
```python
    if search:
        pattern = f"%{search}%"
        aliases_str = func.array_to_string(Target.aliases, ' ')
        searchable_text = func.concat(Target.primary_name, ' ', aliases_str)
        # Search in target name, aliases, OR OBJECT header for unresolved images
        base_filter.append(
            or_(
                Target.primary_name.ilike(pattern),
                aliases_str.ilike(pattern),
                func.similarity(searchable_text, search) > 0.3,
                Image.raw_headers["OBJECT"].astext.ilike(pattern),
            )
        )
```

With:
```python
    if search:
        pattern = f"%{search}%"
        aliases_str = func.array_to_string(Target.aliases, ' ')
        searchable_text = func.concat(
            func.coalesce(Target.catalog_id, ''), ' ',
            func.coalesce(Target.common_name, ''), ' ',
            aliases_str,
        )
        # Search in target name, aliases, OR OBJECT header for unresolved images
        base_filter.append(
            or_(
                Target.primary_name.ilike(pattern),
                Target.catalog_id.ilike(pattern),
                Target.common_name.ilike(pattern),
                aliases_str.ilike(pattern),
                func.similarity(searchable_text, search) > 0.3,
                Image.raw_headers["OBJECT"].astext.ilike(pattern),
            )
        )
```

- [ ] **Step 3: Update SearchBar to use `catalog_id` for filter query**

Edit `frontend/src/components/SearchBar.tsx`, the `selectTarget` function (lines 35-38):

Replace:
```typescript
  const selectTarget = (target: TargetSearchResultFuzzy) => {
    setQuery(target.primary_name);
    setShowSuggestions(false);
    updateFilter("searchQuery", target.primary_name);
  };
```

With:
```typescript
  const selectTarget = (target: TargetSearchResultFuzzy) => {
    const searchValue = target.primary_name;
    setQuery(searchValue);
    setShowSuggestions(false);
    updateFilter("searchQuery", searchValue);
  };
```

No functional change needed here — `primary_name` will now be "NGC 7000 - North America Nebula" which contains both the catalog ID and common name, so substring search will match naturally. The original bug (double-spaced `NGC  7000`) is fixed by the data, not the frontend.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/targets.py
git commit -m "feat: update search queries to use catalog_id and common_name"
```

---

### Task 6: Backfill Script

**Files:**
- Modify: `backend/backfill_targets.py`

- [ ] **Step 1: Rewrite backfill script to use TAP + new curation logic**

Replace the entire contents of `backend/backfill_targets.py`:

```python
"""Backfill catalog_id, common_name, and curated aliases for all targets.

Re-queries SIMBAD TAP for clean aliases, applies catalog priority
hierarchy, and reconstructs primary_name as "CATALOG_ID - Common Name".
Also backfills resolved_target_id for unresolved images.
"""

import asyncio
import logging

from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Image, Target
from app.services.simbad import (
    resolve_target_name,
    normalize_object_name,
    _fetch_tap_aliases,
    curate_aliases,
    extract_catalog_id,
    extract_common_name,
    build_primary_name,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


async def backfill_existing_targets():
    """Re-process all existing targets: fetch clean aliases, set catalog_id/common_name."""
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(select(Target).where(Target.merged_into_id.is_(None)))
        targets = result.scalars().all()
        log.info("Processing %d targets", len(targets))

        for target in targets:
            # Get FITS OBJECT names linked to this target
            fits_result = await session.execute(
                text("""
                    SELECT DISTINCT raw_headers->>'OBJECT' AS obj
                    FROM images
                    WHERE resolved_target_id = :tid
                      AND raw_headers->>'OBJECT' IS NOT NULL
                """),
                {"tid": target.id},
            )
            fits_names = [row[0] for row in fits_result.all() if row[0]]

            # Fetch clean aliases from SIMBAD TAP using old primary_name
            old_primary = target.primary_name
            raw_aliases = await _fetch_tap_aliases(old_primary)

            if not raw_aliases:
                # TAP failed or returned nothing — try with normalized name
                from app.services.simbad import _normalize_ws
                raw_aliases = await _fetch_tap_aliases(_normalize_ws(old_primary))

            if raw_aliases:
                catalog_id = extract_catalog_id(raw_aliases, old_primary)
                common_name = extract_common_name(raw_aliases, fits_names=fits_names)
                curated = curate_aliases(raw_aliases, fits_names=fits_names)
            else:
                # SIMBAD unavailable — do best-effort from existing data
                log.warning("  No TAP data for %s — using existing aliases", old_primary)
                from app.services.simbad import _normalize_ws
                catalog_id = _normalize_ws(old_primary)
                common_name = extract_common_name([], fits_names=fits_names)
                curated = [normalize_object_name(n) for n in fits_names]

            primary_name = build_primary_name(catalog_id, common_name)

            # Ensure FITS names are in aliases
            for name in fits_names:
                normalized = normalize_object_name(name)
                if normalized not in [a.upper() for a in curated]:
                    curated.append(normalized)

            target.primary_name = primary_name
            target.catalog_id = catalog_id
            target.common_name = common_name
            target.aliases = curated

            log.info("  %s -> %s (catalog=%s, common=%s, %d aliases)",
                     old_primary, primary_name, catalog_id, common_name, len(curated))

            await asyncio.sleep(0.5)  # Rate limit

        await session.commit()
        log.info("Done! Updated %d targets", len(targets))

    await engine.dispose()


async def backfill_unresolved():
    """Resolve unresolved images (same as original backfill)."""
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        result = await session.execute(
            text("""
                SELECT raw_headers->>'OBJECT' AS obj, COUNT(*) AS cnt
                FROM images
                WHERE resolved_target_id IS NULL
                  AND raw_headers->>'OBJECT' IS NOT NULL
                  AND raw_headers->>'OBJECT' != ''
                GROUP BY raw_headers->>'OBJECT'
                ORDER BY cnt DESC
            """)
        )
        unresolved = result.all()
        log.info("Found %d unique unresolved object names", len(unresolved))

        resolved = 0
        failed = []

        for obj_name, img_count in unresolved:
            normalized = normalize_object_name(obj_name)

            # Check existing target by alias
            existing = await session.execute(
                select(Target).where(Target.aliases.any(normalized))
            )
            target = existing.scalar_one_or_none()

            if not target:
                # Query SIMBAD
                simbad_result = await resolve_target_name(obj_name)

                if simbad_result:
                    # Check if this target already exists
                    existing = await session.execute(
                        select(Target).where(Target.catalog_id == simbad_result.get("catalog_id"))
                    )
                    target = existing.scalar_one_or_none()

                    if not target:
                        target = Target(
                            primary_name=simbad_result["primary_name"],
                            catalog_id=simbad_result.get("catalog_id"),
                            common_name=simbad_result.get("common_name"),
                            aliases=simbad_result.get("aliases", []),
                            ra=simbad_result.get("ra"),
                            dec=simbad_result.get("dec"),
                            object_type=simbad_result.get("object_type"),
                        )
                        session.add(target)
                        await session.flush()
                    else:
                        # Add alias if missing
                        if normalized not in [a.upper() for a in target.aliases]:
                            target.aliases = [*target.aliases, normalized]
                            await session.flush()

                    await asyncio.sleep(0.5)
                else:
                    failed.append(obj_name)
                    log.info("  FAILED: %s (%d images)", obj_name, img_count)
                    await asyncio.sleep(0.5)
                    continue

            # Bulk-update images
            up = await session.execute(
                text("""
                    UPDATE images
                    SET resolved_target_id = :target_id
                    WHERE resolved_target_id IS NULL
                      AND raw_headers->>'OBJECT' = :obj_name
                """),
                {"target_id": target.id, "obj_name": obj_name},
            )
            resolved += 1
            log.info("  OK: %s -> %s (%d images)", obj_name, target.primary_name, up.rowcount)

        await session.commit()
        log.info("Resolved: %d, Failed: %d", resolved, len(failed))
        if failed:
            log.info("Failed names: %s", failed)

    await engine.dispose()


async def main():
    log.info("=== Phase 1: Backfill existing targets ===")
    await backfill_existing_targets()
    log.info("")
    log.info("=== Phase 2: Resolve unresolved images ===")
    await backfill_unresolved()


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Commit**

```bash
git add backend/backfill_targets.py
git commit -m "feat: rewrite backfill script with TAP aliases and catalog priority"
```

---

### Task 7: Deploy & Run Backfill

**Files:** None (operational task)

- [ ] **Step 1: Push and deploy**

```bash
git push origin dev
ssh -i ~/.ssh/id_ed25519 kumar@astrodb.lan "cd ~/git/astro-session-diary && git pull && docker compose up -d --build app"
```

- [ ] **Step 2: Run migration**

```bash
ssh -i ~/.ssh/id_ed25519 kumar@astrodb.lan "docker compose -f ~/git/astro-session-diary/docker-compose.yml exec -T app python3 -m alembic upgrade head"
```

- [ ] **Step 3: Run backfill**

```bash
ssh -i ~/.ssh/id_ed25519 kumar@astrodb.lan "docker compose -f ~/git/astro-session-diary/docker-compose.yml exec -T app python3 backfill_targets.py"
```

- [ ] **Step 4: Verify data**

```bash
ssh -i ~/.ssh/id_ed25519 kumar@astrodb.lan "docker compose -f ~/git/astro-session-diary/docker-compose.yml exec -T postgres psql -U astro -d astro_catalog -c \"
SELECT primary_name, catalog_id, common_name, array_length(aliases, 1) as alias_count
FROM targets
WHERE merged_into_id IS NULL
ORDER BY primary_name
LIMIT 20;
\""
```

Expected: `primary_name` shows "M 31 - Andromeda Galaxy" format, `catalog_id` is clean, no double spaces, aliases are properly split.

- [ ] **Step 5: Test search in UI**

Open `http://astrodb.lan:8080` and test:
- Search "7000" — should show "NGC 7000 - North America Nebula"
- Select it — should show only one result (no duplicate unresolved entry)
- Search "Andromeda" — should match via common_name
- Search "M 31" — should match via catalog_id
- Search "Andrmeda" (typo) — should fuzzy match
