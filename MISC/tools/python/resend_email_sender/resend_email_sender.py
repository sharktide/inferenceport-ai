#!/usr/bin/env python3
import json
import sys
import urllib.request
import urllib.error


def parse_args(argv):
    out = {}
    i = 0
    while i < len(argv):
        token = argv[i]
        if token.startswith("--"):
            key = token[2:]
            value = argv[i + 1] if i + 1 < len(argv) else ""
            i += 1
            if value in ("true", "false"):
                out[key] = value == "true"
            else:
                try:
                    out[key] = json.loads(value)
                except Exception:
                    out[key] = value
        i += 1
    return out


def main():
    args = parse_args(sys.argv[1:])
    to_addr = str(args.get("to", "")).strip()
    subject = str(args.get("subject", "")).strip()
    text = str(args.get("text", "")).strip()
    resend_api_key = str(args.get("resend_api_key", "")).strip()
    sender_email = str(args.get("sender_email", "")).strip()

    if not to_addr or not subject or not text:
        raise ValueError("to, subject, and text are required")
    if not resend_api_key or not sender_email:
        raise ValueError("resend_api_key and sender_email are required private inputs")

    payload = {
        "from": sender_email,
        "to": [to_addr],
        "subject": subject,
        "text": text,
    }

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(body) if body else {}
            print(json.dumps({
                "ok": True,
                "status": resp.status,
                "response": parsed,
            }, indent=2))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else str(e)
        print(json.dumps({"ok": False, "status": e.code, "error": detail}, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
