# Backend logging

[English](backend-logging.md) · [فارسی](backend-logging.fa.md)

Pino writes structured JSON with UTC timestamps, level, environment and release.
`LOG_LEVEL`, `SERVER_ENVIRONMENT` and `SERVER_RELEASE_ID` configure it; production
requires an immutable release identifier. Pretty printing is development-only.
Docker uses stdout/stderr; native services use journald. No logging dashboard or
external collector is provisioned by these templates.

Responses handled by the initialized HTTP application expose a bounded
`X-Request-Id`; valid supplied IDs propagate,
invalid or sensitive-looking values become UUIDs. Exactly one final request event
records the outcome, with user identity only after authentication. Error serializers
retain safe stack locations and cause structure without SDK payloads, SQL,
credentials or arbitrary user strings. Redaction covers nested credentials, cookies,
OTP and storage/database values, including child loggers and provider diagnostics.
Upload logs contain safe metadata, never bytes; compensation failures have a
separate event without replacing the original metadata failure. The startup 503
responses are served before this request middleware is installed.

Run the API logging, request and lifecycle tests through `npm run test:coverage`.
`npm run test:recovery` also exercises a [synthetic storage incident](recovery-drills.md)
with actual HTTP request/release/log correlation and recovery; it does not run a
browser or provision a collector.
See the [security review](security/authentication-review.md).

## Configuration and events

| Variable           | Default / constraint                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| NODE_ENV           | development; deployed runtime uses production                                                                  |
| LOG_LEVEL          | debug in development, otherwise info; debug/info/warn/error                                                    |
| SERVER_ENVIRONMENT | NODE_ENV; 1–64 ASCII letters, digits, underscore, dot or hyphen                                                |
| SERVER_RELEASE_ID  | development outside production; production requires immutable ID, 1–128 supported characters including @ and / |

Invalid configuration fails without printing the supplied value. A bootstrap
logger uses environment=bootstrap and release=unknown if normal setup fails.
Records include time, numeric level, service=kernel-api, environment and release.
Request records add requestId, method, matched route path, status, durationMs and
authenticated userId when available. Raw URL queries and identifiers are omitted.

| Event                                                           | Meaning                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| api.request.completed                                           | Exactly one final Hono outcome; info/warn/error by status |
| auth.login.failed / auth.diagnostic                             | Safe auth outcome/provider diagnostic                     |
| file.upload.completed / file.upload.failed                      | Safe size/type/visibility or failure stage                |
| storage.operation.failed / storage.cleanup.failed               | Operation failure and distinct compensation failure       |
| server.started / server.stopped                                 | Process lifecycle                                         |
| server.startup.failed / server.shutdown.failed / server.crashed | Fatal startup/crash or bounded shutdown error             |

Request IDs accept 1–128 ASCII letters, digits, underscore, hyphen or equals.
Sensitive-looking or invalid supplied IDs become UUIDs. They are untrusted
correlation metadata, not authentication or an immutable audit identifier.

Never log raw requests, bodies, headers, auth/session/config objects, SQL, file
bytes or SDK payloads. Keep event messages fixed and explicitly select metadata.
Sanitization cannot recognize every bare unknown secret in prose. Error messages
are withheld; safe type/code, bounded causes and source basenames/line/column
remain. Do not disable redaction in development. Logs need operator-controlled
retention, encryption and access; they are not an immutable security audit store.

SIGINT/SIGTERM shutdown is bounded to ten seconds. Uncaught exceptions/rejections
emit a fatal event, allow at most one second to flush and exit 1. Hard kills or
broken stdout cannot guarantee delivery; a process supervisor handles restarts.
