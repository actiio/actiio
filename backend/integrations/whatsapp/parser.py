from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List


def _to_iso8601(unix_seconds: str) -> str:
    dt = datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc)
    return dt.isoformat()


def parse_inbound_messages(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []

    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value", {})
            metadata = value.get("metadata", {})
            phone_number_id = metadata.get("phone_number_id")
            display_phone_number = metadata.get("display_phone_number")

            contacts = value.get("contacts", []) or []
            contact_map = {c.get("wa_id"): c.get("profile", {}).get("name") for c in contacts}

            for msg in value.get("messages", []) or []:
                text = msg.get("text", {}).get("body") or ""
                from_wa_id = msg.get("from")
                timestamp = msg.get("timestamp")

                results.append(
                    {
                        "whatsapp_message_id": msg.get("id"),
                        "phone_number_id": phone_number_id,
                        "display_phone_number": display_phone_number,
                        "from_wa_id": from_wa_id,
                        "contact_name": contact_map.get(from_wa_id),
                        "content": text,
                        "timestamp": _to_iso8601(timestamp) if timestamp else None,
                        "direction": "inbound",
                    }
                )

    return results
