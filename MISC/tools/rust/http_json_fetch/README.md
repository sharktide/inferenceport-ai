# HTTP JSON Fetch (Rust)

## What it does
Makes a simple HTTP GET request and returns raw response text (headers + body).

## Code file
- `http_json_fetch.rs`

## Assistant inputs (tool arguments)
- `url` (required, `http://` in this sample)

## User inputs (private)
- `api_token` (optional bearer token)

## Notes
This sample uses `std::net::TcpStream` and currently supports plain HTTP (`http://`) only.

## Example invocation
`--url http://httpbin.org/get`
