# HTTP transport adapters

[English](http-transport.md) · [فارسی](http-transport.fa.md)

The HTTP transport phase adds Hono route adapters over the existing application
services. It is not a runnable server: composition, startup, deployment and
production OTP delivery require later review. Frontends communicate over HTTP
and incompatible contract changes require coordinated rollout.

Adapters validate input, map semantic errors to localized status responses,
enforce authorization and origin checks, and log request identifiers without
credentials or raw paths. The authentication attempt limiter is local to a
single process and cannot enforce distributed rate limits; production ingress
must provide independent throttling.

File uploads are authenticated before reading multipart data. The transport
counts actual streamed bytes rather than trusting `Content-Length`, and caps the
whole multipart body at the configured file limit plus 64 KiB of framing and
fields. The application independently validates the resulting file bytes.
Tests exercise synthetic service ports and a local Node HTTP bridge, not the
future production network adapter or a deployed storage integration. Coordinate
rollout and rollback with independently deployed HTTP clients; do not infer that
the endpoint is usable before composition and a server entry point are published.
