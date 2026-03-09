"""
Shared helpers for signal_events. Ensures start_date is set when perception layer saves events.
"""
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict


# Keys to check for event date (in order of preference)
_DATE_KEYS = ("start_date", "date", "event_date", "published", "pub_date", "pubDate", "updated", "created_at")


def _parse_date(value: Any) -> str | None:
    """Parse a date value to ISO 8601 string for Postgres timestamptz. Returns None if unparseable."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        except (OSError, ValueError):
            return None
    s = str(value).strip()
    if not s:
        return None
    # RFC 2822 (e.g. RSS pubDate: "Wed, 02 Oct 2002 13:00:00 GMT")
    try:
        dt = parsedate_to_datetime(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, TypeError):
        pass
    # Try ISO and YYYY-MM-DD
    part = s.replace("Z", "").replace("+00:00", "").strip()
    try:
        if "T" in part:
            dt = datetime.strptime(part[:19], "%Y-%m-%dT%H:%M:%S")
        elif len(s) >= 10 and s[4] == "-" and s[7] == "-":
            dt = datetime.strptime(s[:10], "%Y-%m-%d")
        else:
            raise ValueError("no match")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        pass
    return None


def ensure_start_date(ev: Dict[str, Any]) -> None:
    """
    Set ev['start_date'] to an ISO timestamptz string. Prefer date from event (start_date, date, event_date,
    published, pub_date, etc.); if none found or parse fails, use current UTC.
    Mutates ev in place.
    """
    for key in _DATE_KEYS:
        if key not in ev:
            continue
        parsed = _parse_date(ev.get(key))
        if parsed:
            ev["start_date"] = parsed
            return
    ev["start_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
