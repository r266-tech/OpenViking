use std::{
    io::{Read, Write},
    process::{Command, Stdio},
};

#[test]
fn connection_errors_include_the_underlying_cause() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let server = std::thread::spawn(move || {
        for _ in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut request = [0; 4096];
            assert!(stream.read(&mut request).unwrap() > 0);
            stream.write_all(b"not HTTP\r\n\r\n").unwrap();
        }
    });
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join("ovcli.conf");
    std::fs::write(&config, serde_json::json!({"url": url}).to_string()).unwrap();
    for format in ["json", "table"] {
        let result = Command::new(env!("CARGO_BIN_EXE_ov"))
            .current_dir(dir.path())
            .env("OPENVIKING_CLI_CONFIG_FILE", &config)
            .env("OPENVIKING_LANG", "en")
            .env("NO_PROXY", "127.0.0.1")
            .env("no_proxy", "127.0.0.1")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null())
            .args(["-o", format, "health"])
            .output()
            .unwrap();
        assert!(!result.status.success(), "{result:?}");
        let text = String::from_utf8_lossy(&result.stderr);
        let message = text
            .replace('│', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        assert!(message.contains("invalid HTTP version"), "{text}");
        if format == "json" {
            let data: serde_json::Value = serde_json::from_slice(&result.stderr).unwrap();
            assert_eq!(data["error"]["code"], "UNAVAILABLE");
        } else {
            assert!(text.contains("Connection Error"), "{text}");
            assert!(!text.contains("server may be offline"), "{text}");
        }
    }
    server.join().unwrap();
}
