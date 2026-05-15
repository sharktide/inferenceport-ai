# Resend Email Sender (Python)

## What it does
Sends a plain-text email via [Resend](https://resend.com) using private credentials supplied at runtime.

## Code file
- `resend_email_sender.py`

## Assistant inputs (tool arguments)
- `to` (required)
- `subject` (required)
- `text` (required)

## User inputs (private)
- `resend_api_key` (required secret)
- `sender_email` (required)

## Example invocation
`--to alex@example.com --subject "Status Update" --text "Build completed successfully."`
