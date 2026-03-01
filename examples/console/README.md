# OpenViking Console Example

This is an example-only standalone console service.
It is not wired into release packaging or CLI commands.

## What it provides

- File system browsing (`ls/tree/stat`)
- Find query
- Add resource (`/api/v1/resources`)
- Tenant/account management UI
- System/observer status panels

## Quick start

1. Start OpenViking server (default: `http://127.0.0.1:1933`)
2. Start this console example:

```bash
python examples/console/run_console.py
```

3. Open:

```text
http://127.0.0.1:1989/
```

## Runtime environment variables

- `OPENVIKING_BASE_URL` (default `http://127.0.0.1:1933`)
- `CONSOLE_HOST` (default `127.0.0.1`)
- `CONSOLE_PORT` (default `1989`)
- `CONSOLE_WRITE_ENABLED` (default `false`)
- `CONSOLE_REQUEST_TIMEOUT_SEC` (default `30`)

`CONSOLE_WRITE_ENABLED=false` means write operations are blocked by backend guardrails.
