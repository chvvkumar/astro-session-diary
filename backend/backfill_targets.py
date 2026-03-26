"""Backfill resolved_target_id for already-ingested images.

Queries SIMBAD once per unique OBJECT name (~108 names for 8k+ images)
with 0.5s delay between requests to respect rate limits.
"""

import asyncio
import logging

from sqlalchemy import select, update, func, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.models import Image, Target
from app.services.simbad import resolve_target_name, normalize_object_name

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)


async def backfill():
    engine = create_async_engine(settings.database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Get distinct unresolved object names
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
        updated_total = 0

        for obj_name, img_count in unresolved:
            normalized = normalize_object_name(obj_name)

            # Check existing target by alias
            existing = await session.execute(
                select(Target).where(Target.aliases.any(normalized))
            )
            target = existing.scalar_one_or_none()

            # Check by primary_name
            if not target:
                existing = await session.execute(
                    select(Target).where(Target.primary_name == obj_name)
                )
                target = existing.scalar_one_or_none()

            if not target:
                # Query SIMBAD
                simbad_result = await resolve_target_name(obj_name)

                if simbad_result:
                    # Check if SIMBAD's primary_name already exists
                    existing = await session.execute(
                        select(Target).where(
                            Target.primary_name == simbad_result["primary_name"]
                        )
                    )
                    target = existing.scalar_one_or_none()

                    if not target:
                        aliases = [
                            normalize_object_name(a)
                            for a in simbad_result.get("aliases", [])
                        ]
                        if normalized not in aliases:
                            aliases.append(normalized)
                        target = Target(
                            primary_name=simbad_result["primary_name"],
                            aliases=aliases,
                            ra=simbad_result.get("ra"),
                            dec=simbad_result.get("dec"),
                            object_type=simbad_result.get("object_type"),
                        )
                        session.add(target)
                        await session.flush()
                    else:
                        # Add alias if missing
                        if normalized not in target.aliases:
                            target.aliases = [*target.aliases, normalized]
                            await session.flush()

                    await asyncio.sleep(0.5)
                else:
                    failed.append(obj_name)
                    log.info("  FAILED: %s (%d images)", obj_name, img_count)
                    await asyncio.sleep(0.5)
                    continue

            # Bulk-update all images with this object name
            up = await session.execute(
                text("""
                    UPDATE images
                    SET resolved_target_id = :target_id
                    WHERE resolved_target_id IS NULL
                      AND raw_headers->>'OBJECT' = :obj_name
                """),
                {"target_id": target.id, "obj_name": obj_name},
            )
            updated_total += up.rowcount
            resolved += 1
            log.info(
                "  OK: %s -> %s (%d images)",
                obj_name, target.primary_name, up.rowcount,
            )

        await session.commit()
        log.info("")
        log.info(
            "Done! Resolved: %d, Failed: %d, Images updated: %d",
            resolved, len(failed), updated_total,
        )
        if failed:
            log.info("Failed names: %s", failed)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(backfill())
