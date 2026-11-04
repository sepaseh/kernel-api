# Backend logging

The http-composition phase includes Pino logging, sanitization, fatal process
handlers, safe storage diagnostics and Hono request logging. Pino writes structured JSON with UTC
timestamps, level, environment and release. `LOG_LEVEL`, `SERVER_ENVIRONMENT`
and `SERVER_RELEASE_ID` configure it. Configuration parses a supplied environment
object or `process.env` without loading private files.

Real Pino tests cover structured context and redaction, including child loggers
and synthetic provider diagnostics. Error serializers retain bounded safe type,
code, stack locations and cause structure without copying error messages, SDK
payloads, SQL, credentials or arbitrary user strings. Development pretty output
uses the development-only `pino-pretty` dependency and preserves redaction.

Isolated subprocess tests exercise fatal logging, flushing and unsuccessful exit.
Separate HTTP/runtime suites start the local Node server with disposable data
and exercise startup, readiness, cleanup and signal-driven shutdown. Deployment
collectors, native service integration and recovery drills remain planned work;
none is provisioned by local execution.

Initialized HTTP responses expose a bounded `X-Request-Id`. Valid supplied IDs
propagate; invalid or sensitive-looking values become UUIDs. Exactly one final
request event records the outcome, with user identity only after authentication.
Initial bodyless 503 responses are served before request middleware is installed
and omit this header.

Run the logging and fatal-lifecycle suites through the complete
[canonical profile](../.agents/validation.json) on the exact proposed inventory.
These tests establish local logging behavior, not a deployed service or an
external collector. See [validation](validation.md).

## Configuration and events

| Variable           | Default / constraint                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| NODE_ENV           | development; controls logging defaults                                                                    |
| LOG_LEVEL          | debug in development, otherwise info; debug/info/warn/error                                               |
| SERVER_ENVIRONMENT | NODE_ENV; 1-64 ASCII letters, digits, underscore, dot or hyphen                                           |
| SERVER_RELEASE_ID  | development outside production; production requires an ID of 1-128 supported characters including @ and / |

The configuration loader validates the ID's format and presence in production;
this is an input constraint, not evidence of a production deployment. Keeping a
release identifier immutable across process starts remains an operator invariant.
Pretty printing is selected only when both `NODE_ENV` and `SERVER_ENVIRONMENT`
resolve to development. Invalid configuration fails without printing its supplied
value. Records include time, numeric level, service=kernel-api, environment and
release.

| Event                                                           | Current owner and meaning                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------- |
| api.request.completed                                           | Exactly one final Hono outcome, with a level selected by status |
| auth.login.failed / auth.diagnostic                             | Safe authentication outcome and provider diagnostic             |
| file.upload.completed / file.upload.failed                      | Safe upload metadata or failure stage                           |
| storage.operation.failed / storage.cleanup.failed               | Storage operation or distinct compensation failure              |
| server.started / server.stopped                                 | Local server lifecycle                                          |
| server.startup.failed / server.shutdown.failed / server.crashed | Failed startup/shutdown or fatal process failure                |

`withStorageLogging` omits the underlying failure from its diagnostic and rethrows
the original error. A throwing logger does not replace that failure. Upload
events contain safe metadata, never bytes. Compensation failure has a separate
event and must not replace the original metadata failure.

Request IDs accept 1-128 ASCII letters, digits, underscore, hyphen or equals.
They are untrusted correlation metadata, not authentication or an immutable
audit identifier. Request logs use the matched route, status and duration;
raw URL queries and credentials are omitted.

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
The local server handles SIGINT/SIGTERM with bounded shutdown. Its tests use real
Unix signals or the Windows signal-message simulation in their respective
environments. No deployment process supervisor is provisioned here.

The logging suite uses the real Drizzle error class to verify redaction. Database
and authentication integration have their own suites; the redaction regression
test alone does not establish those behaviors.
