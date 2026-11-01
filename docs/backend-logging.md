# Backend logging

The configured-storage phase publishes Pino logging, sanitization, fatal process
handlers and safe storage diagnostics. Pino writes structured JSON with UTC
timestamps, level, environment and release. `LOG_LEVEL`, `SERVER_ENVIRONMENT`
and `SERVER_RELEASE_ID` configure it. Configuration parses a supplied environment
object or `process.env` without loading private files.

Real Pino tests cover structured context and redaction, including child loggers
and synthetic provider diagnostics. Error serializers retain bounded safe type,
code, stack locations and cause structure without copying error messages, SDK
payloads, SQL, credentials or arbitrary user strings. Development pretty output
uses the development-only `pino-pretty` dependency and preserves redaction.

Isolated subprocess tests exercise fatal logging, flushing and unsuccessful exit.
They do not start an API. HTTP request middleware, request-ID response headers,
startup/readiness and signal-driven server shutdown belong to later HTTP/server
publication. Deployment collectors, native service integration, recovery drills
and their guides are also planned work; none is provisioned here.

Run the logging and fatal-lifecycle suites through the complete
[canonical profile](../.agents/validation.json) on the exact proposed inventory.
These tests establish local logging behavior, not a deployed service or an
external collector. See [validation](validation.md).

## Configuration and events

| Variable           | Default / constraint                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| NODE_ENV           | development; controls logging defaults                                                                      |
| LOG_LEVEL          | debug in development, otherwise info; debug/info/warn/error                                                 |
| SERVER_ENVIRONMENT | NODE_ENV; 1â€“64 ASCII letters, digits, underscore, dot or hyphen                                           |
| SERVER_RELEASE_ID  | development outside production; production requires an ID of 1â€“128 supported characters including @ and / |

The configuration loader validates the ID's format and presence in production;
this is an input constraint, not evidence of a production deployment. Keeping a
release identifier immutable across process starts remains an operator invariant.
Pretty printing is selected only when both `NODE_ENV` and `SERVER_ENVIRONMENT`
resolve to development. Invalid configuration fails without printing its supplied
value. Records include time, numeric level, service=kernel-api, environment and
release.

| Event                    | Current owner and meaning                                                    |
| ------------------------ | ---------------------------------------------------------------------------- |
| auth.diagnostic          | Logger utility for safe synthetic provider diagnostics; no auth SDK is wired |
| storage.operation.failed | Storage wrapper records only the driver and operation on failure             |
| server.crashed           | Installed fatal handler records an uncaught exception or unhandled rejection |

`withStorageLogging` omits the underlying failure from its diagnostic and rethrows
the original error. A throwing logger does not replace that failure. HTTP
request/upload events and request-ID correlation are planned for their owning
transport modules, not established by the logger utility alone.

Never log raw requests, bodies, headers, auth/session/config objects, SQL, file
bytes or SDK payloads. Keep event messages fixed and explicitly select metadata.
Sanitization cannot recognize every bare unknown secret in prose. Error messages
are withheld; safe type/code, bounded causes and source basenames/line/column
remain. Do not disable redaction in development. Logs need operator-controlled
retention, encryption and access; they are not an immutable security audit store.

Callers explicitly install the fatal handlers. An uncaught exception or unhandled
rejection emits a fatal event, allows at most one second to flush and exits 1.
Throwing logging or flush operations must not expose the raw failure or prevent
unsuccessful termination. Hard kills or broken output cannot guarantee delivery.
No server entry point, signal-shutdown implementation or process supervisor is
published in this phase.

The logging suite uses the real Drizzle error class solely to verify redaction.
Drizzle is a development dependency in this phase; database adapters and real
database integration are not published by this logging test.
