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
            lines = [l.strip() for l in data_section.splitlines() if l.strip() and not l.startswith("~")]
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
                aliases = [a.strip() for a in alias_data.splitlines() if a.strip() and not a.startswith("~")]

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


async def resolve_target_name(object_name: str) -> dict[str, Any] | None:
    """Resolve an object name via SIMBAD. Returns dict with primary_name,
    aliases, ra, dec, object_type — or None if not found."""
    return await _query_simbad(object_name)
