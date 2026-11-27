from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.core.db import get_conn


def test_connection_can_be_used_across_threads(tmp_path: Path) -> None:
    """FastAPI may enter, use, and close a dependency on different workers."""
    conn = get_conn(tmp_path / "threaded.db")
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            value = pool.submit(
                lambda: conn.execute("SELECT 1;").fetchone()[0]
            ).result()
            assert value == 1
            pool.submit(conn.close).result()
    finally:
        # The connection is normally closed in the worker above.  Keep a
        # best-effort cleanup for the failure path without masking the error.
        try:
            conn.close()
        except Exception:
            pass
