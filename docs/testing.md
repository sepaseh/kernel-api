# API testing

[English](testing.md) · [فارسی](testing.fa.md)

The published suite tests application services, HTTP behavior, authentication,
database transactions, logging, localization and storage using isolated synthetic
fixtures. The exact commands are maintained in [the validation manifest](../.agents/validation.json)
and `package.json`; do not infer coverage from a list of filenames.

`npm run test:recovery` runs three isolated recovery and incident drills. They also
run as part of `test:coverage`. [Recovery drills](recovery-drills.md) describes
their scope. The signed object-storage fixture is loopback-only; it is not a deployed
MinIO service. Local HTTP tests do not establish a deployed client or SMS provider.

The opt-in Docker smoke uses its own temporary project, builder, images and data;
see [Docker deployment](../deploy/docker/README.md). Native smoke exercises the
packaged Node payload on the host platform, not necessarily systemd or Nginx.
If the native smoke server does not stop within 10 seconds, its temporary release and state are preserved and the failure is reported. After a confirmed stop, removal of each owned resource is attempted independently.
Never delete resources belonging to another project during cleanup.

The collection tests exercise eight authentication rate-limit responses against the saved examples with a controlled clock. They verify `Retry-After` on the in-process limiter; they do not establish distributed rate limiting or production readiness.

The opt-in native smoke installs production-only dependencies in an owned
release, bootstraps a temporary database and checks health and login against
the packaged server. It tests the current host platform, not a Linux service
manager on Windows. Docker smoke uses a per-run builder and removes its owned
images, cache and fixtures on success, failure or handled cancellation; cleanup
failures fail the command. See the [Docker cleanup policy](../deploy/docker/README.md)
and the dated [QA records](qa/README.md) for observed results and limits.
