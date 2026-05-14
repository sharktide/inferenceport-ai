# File Overview (JavaScript)

## What it does
Scans a directory and returns a JSON inventory of files/folders with path, type, size, and modified time.

## Code file
- `file_overview.js`

## Metadata
- `metadata.json` contains the OpenAI function schema and private user input definition.

## Assistant inputs (tool arguments)
- `directory` (required)
- `max_depth` (optional)
- `max_entries` (optional)
- `include_hidden` (optional)

## User inputs (private)
- `workspace_root` (optional boundary to prevent scanning outside a safe root)

## Example invocation
`--directory A:\inferenceport-ai --max_depth 2 --max_entries 250 --include_hidden false`
