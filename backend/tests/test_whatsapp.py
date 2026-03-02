from __future__ import annotations

import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str(BASE_DIR))

from integrations.whatsapp.parser import parse_inbound_messages


SAMPLE_WEBHOOK = {
    "object": "whatsapp_business_account",
    "entry": [
        {
            "changes": [
                {
                    "value": {
                        "metadata": {
                            "display_phone_number": "15551234567",
                            "phone_number_id": "123456789",
                        },
                        "contacts": [{"profile": {"name": "Test Lead"}, "wa_id": "919999999999"}],
                        "messages": [
                            {
                                "from": "919999999999",
                                "id": "wamid.TESTID",
                                "timestamp": "1700000000",
                                "text": {"body": "Hi, can you share pricing?"},
                                "type": "text",
                            }
                        ],
                    }
                }
            ]
        }
    ],
}


def main() -> None:
    parsed = parse_inbound_messages(SAMPLE_WEBHOOK)
    print(json.dumps(parsed, indent=2))


if __name__ == "__main__":
    main()
