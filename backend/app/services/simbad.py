import re
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SIMBAD_TAP_URL = "https://simbad.u-strasbg.fr/simbad/sim-id"


def normalize_object_name(name: str) -> str:
    """Normalize a target name: strip outer whitespace, uppercase, collapse inner spaces."""
    cleaned = re.sub(r"\s+", " ", name.strip()).upper()
    return cleaned


async def _query_simbad(object_name: str) -> dict[str, Any] | None:
    """Query SIMBAD for an object by name. Returns structured data or None."""
    # Sanitize object name — strip newlines and control characters
    import string
    safe_chars = string.printable.replace('\n', '').replace('\r', '').replace('\t', '')
    sanitized = ''.join(c for c in object_name if c in safe_chars).strip()
    if not sanitized:
        return None

    params = {
        "Ident": sanitized,
        "output.format": "ASCII",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Use the SIMBAD script interface for structured results
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
            # Parse the response — look for data lines after ::data::
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

            # Fetch aliases via a second query
            alias_script = f"""
                format object "%IDLIST[%*]"
                query id {sanitized}
            """
            alias_resp = await client.post(
                "https://simbad.cds.unistra.fr/simbad/sim-script",
                data={"script": alias_script},
                timeout=15.0,
            )
            aliases = []
            if alias_resp.status_code == 200:
                alias_data = alias_resp.text.split("::data::")[-1].strip()
                aliases = [a.strip() for a in alias_data.splitlines()
                           if a.strip() and not a.startswith("~") and not set(a.strip()).issubset({":"})]

            return {
                "primary_name": main_id,
                "aliases": aliases,
                "ra": ra,
                "dec": dec,
                "object_type": obj_type,
            }

    except (httpx.HTTPError, ValueError, IndexError) as e:
        logger.warning("SIMBAD query failed for '%s': %s", sanitized, e)
        return None


# Common names that SIMBAD's script interface doesn't resolve.
# Maps colloquial/common names to SIMBAD-resolvable identifiers.
COMMON_NAME_MAP: dict[str, str] = {
    "pinwheel galaxy": "M 101",
    "flying bat nebula": "Sh2-129",
    "beehive cluster": "M 44",
    "wizard nebula": "NGC 7380",
    "the wizard nebula": "NGC 7380",
    "hamburger galaxy": "NGC 3628",
    "fish head nebula": "IC 1795",
    "dolphin nebula": "Sh2-308",
    "fossil footprint nebula": "NGC 1491",
    "spaghetti nebula": "Simeis 147",
    "sadr region": "IC 1318",
    "elephant's trunk nebula": "IC 1396A",
    "elephant's trunk neb": "IC 1396A",
    "gam cas nebula": "IC 63",
    "markarian's chain": "NAME Markarian's Chain",
    "california nebula": "NGC 1499",
    "heart nebula": "IC 1805",
    "soul nebula": "IC 1848",
    "bode's galaxy": "M 81",
    "moon": "Moon",
    "north america nebula": "NGC 7000",
    "east veil nebula": "NGC 6992",
    "veil nebula": "NGC 6960",
    "flaming star nebula": "IC 405",
    "flame nebula": "NGC 2024",
    "christmas tree cluster": "NGC 2264",
    "cat's eye nebula": "NGC 6543",
    "sombrero galaxy": "M 104",
    "question mark galaxy": "NGC 4258",
    "leo triplet": "NAME Leo Triplet",
    "rho oph": "rho Oph",
    "cave nebula": "Sh2-155",
    "jellyfish nebula": "IC 443",
    "caldwell 4": "NGC 7023",
    "caldwell 38": "NGC 4565",
    "triangulum pinwheel": "M 33",
}

# Strip "Panel N" suffix to get the base object name
_PANEL_RE = re.compile(r"\s+Panel\s+\d+$", re.IGNORECASE)


_SH2_RE = re.compile(r"^Sh2[\s\-_]+(\d+)$", re.IGNORECASE)
_LBN_RE = re.compile(r"^LBN[\s\-_]+(\d+)$", re.IGNORECASE)


def _get_simbad_id(object_name: str) -> str:
    """Try to map a common name to a SIMBAD-resolvable identifier."""
    # Strip panel suffix first
    base = _PANEL_RE.sub("", object_name).strip()
    key = base.lower()

    if key in COMMON_NAME_MAP:
        return COMMON_NAME_MAP[key]

    # Sharpless catalog: "Sh2 174" -> "SH 2-174"
    m = _SH2_RE.match(base)
    if m:
        return f"SH 2-{m.group(1)}"

    # LBN catalog: "LBN 672" -> "LBN 672" (SIMBAD uses this format)
    m = _LBN_RE.match(base)
    if m:
        return f"LBN {m.group(1)}"

    return object_name


async def resolve_target_name(object_name: str) -> dict[str, Any] | None:
    """Resolve an object name via SIMBAD. Returns dict with primary_name,
    aliases, ra, dec, object_type — or None if not found."""
    # Try direct query first
    result = await _query_simbad(object_name)
    if result:
        return result

    # Try common name mapping
    mapped = _get_simbad_id(object_name)
    if mapped != object_name:
        logger.info("Trying mapped name: '%s' -> '%s'", object_name, mapped)
        result = await _query_simbad(mapped)
        if result:
            return result

    return None
