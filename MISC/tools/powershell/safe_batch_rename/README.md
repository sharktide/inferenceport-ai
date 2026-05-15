# Safe Batch Rename (PowerShell)

## What it does
Performs controlled prefix-based batch renames with a preview mode.

## Code file
- `safe_batch_rename.ps1`

## Assistant inputs (tool arguments)
- `directory` (required)
- `prefix` (required)
- `replacement` (required)
- `preview` (optional)

## User inputs (private)
- `allowed_root` (optional path boundary)

## Example invocation
`--directory A:\inferenceport-ai\logs --prefix temp_ --replacement archived_ --preview true`
