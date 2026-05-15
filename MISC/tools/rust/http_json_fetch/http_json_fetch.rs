use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

fn parse_args() -> HashMap<String, String> {
    let mut out = HashMap::new();
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0usize;
    while i < args.len() {
        let t = &args[i];
        if t.starts_with("--") {
            let key = t.trim_start_matches("--").to_string();
            let val = if i + 1 < args.len() { args[i + 1].clone() } else { String::new() };
            out.insert(key, val);
            i += 1;
        }
        i += 1;
    }
    out
}

fn http_get(host: &str, path: &str, token: Option<&str>) -> Result<String, String> {
    let addr = format!("{}:80", host);
    let mut stream = TcpStream::connect(addr).map_err(|e| format!("connect failed: {}", e))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(20)))
        .map_err(|e| e.to_string())?;
    let mut request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nUser-Agent: inferenceport-tool/1.0\r\nAccept: application/json,*/*\r\nConnection: close\r\n",
        path, host
    );
    if let Some(t) = token {
        if !t.trim().is_empty() {
            request.push_str(&format!("Authorization: Bearer {}\r\n", t));
        }
    }
    request.push_str("\r\n");
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("write failed: {}", e))?;

    let mut buf = String::new();
    stream
        .read_to_string(&mut buf)
        .map_err(|e| format!("read failed: {}", e))?;
    Ok(buf)
}

fn main() {
    let args = parse_args();
    let url = args.get("url").map(|s| s.trim().to_string()).unwrap_or_default();
    let token = args.get("api_token").map(|s| s.to_string());

    if url.is_empty() {
        eprintln!("url is required");
        std::process::exit(1);
    }
    if !url.starts_with("http://") {
        eprintln!("this sample expects http:// URLs only");
        std::process::exit(1);
    }

    let without_scheme = url.trim_start_matches("http://");
    let mut split = without_scheme.splitn(2, '/');
    let host = split.next().unwrap_or("");
    let rest = split.next().unwrap_or("");
    let path = format!("/{}", rest);

    if host.is_empty() {
        eprintln!("invalid URL host");
        std::process::exit(1);
    }

    match http_get(host, &path, token.as_deref()) {
        Ok(resp) => {
            println!("{{\"ok\":true,\"url\":{url:?},\"rawResponse\":{resp:?}}}");
        }
        Err(err) => {
            eprintln!("{}", err);
            std::process::exit(1);
        }
    }
}
