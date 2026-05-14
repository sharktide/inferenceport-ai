# InferencePort AI Custom Tool Pack

This folder contains ready-to-upload custom tool examples with:
- Source code file
- `metadata.json` with function schema + private user inputs
- `README.md` with purpose and invocation examples

## Included tools
- `javascript/file_overview`
- `python/resend_email_sender`
- `go/csv_numeric_stats`
- `rust/http_json_fetch`
- `powershell/safe_batch_rename`

## Upload flow (quick)
1. Open InferencePort AI -> Tools manager -> Create Custom Tool.
2. Copy fields from the tool's `metadata.json`.
3. Attach the code file listed in `codeFile`.
4. Save locally, test, then publish/push updates from the same UI.

## Important
Private `userInputs` are never embedded in source code. They are entered during run-approval and merged at execution time.
