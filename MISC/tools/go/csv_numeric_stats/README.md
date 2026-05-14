# CSV Numeric Stats (Go)

## What it does
Reads a CSV file and returns numeric summary statistics for one column, with optional group averages.

## Code file
- `csv_numeric_stats.go`

## Assistant inputs (tool arguments)
- `csv_path` (required)
- `numeric_column` (required)
- `group_by` (optional)

## User inputs (private)
- `allowed_root` (optional path boundary)

## Example invocation
`--csv_path A:\inferenceport-ai\data\sales.csv --numeric_column amount --group_by region`
