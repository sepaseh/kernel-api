# Object storage

[English](object-storage.md) · [فارسی](object-storage.fa.md)

The `storage-adapters` phase implements the application `ObjectStorage` port
with local files and S3-compatible MinIO. `storage/create.ts` selects the adapter
from `ServerConfig.storageDriver`; an unsupported driver fails explicitly.
Creating an adapter does not start the API or call `ensureReady`. The future
application composition must await readiness before accepting uploads. See
[architecture](architecture.md) and the [phase gate](bootstrap.md).

## Local files

`storage/local.ts` writes to separate public/private buckets below the configured
directory. Creation is exclusive: a repeated key cannot overwrite an existing
object. A write/close failure removes only that call's newly created file on a
best-effort basis and preserves the original failure. Failed cleanup can leave
partial bytes for operator attention. Reads and deletes of missing files fail.

Keep this directory under the API process's control. Lexical path containment
does not prevent a privileged host user from inserting symlinks. Public URLs
point to the future API content route; they do not expose the directory or prove
that the route and its authorization exist.

## MinIO through the S3 SDK

`storage/minio.ts` uses `@aws-sdk/client-s3` inside infrastructure. The driver
name and configuration remain `minio`; the SDK does not change the application
port or introduce AWS-specific types into it. The adapter supplies credentials,
endpoint, path-style addressing and a signing region explicitly. Optional
`MINIO_REGION` / `ServerConfig.minio.region` defaults to `us-east-1`; configure the
server's actual region for a nondefault deployment. The region is a 1–63 character
ASCII label: letters, digits and internal hyphens, with alphanumeric ends. Case
is preserved. FIPS aliases that the SDK would rewrite are rejected. AWS region
environment/profile settings are not a substitute for this explicit configuration.
The adapter does not select credentials from a host profile or instance metadata.
Region and HTTP endpoint redirects are not followed; a wrong region or redirect
fails instead of dispatching to an unrelated endpoint.

Supply a host, valid port, TLS flag, explicit nonempty access/secret keys, a bucket
base name and a public URL through the existing configuration object. Do not
commit credentials or put them in public URLs. TLS is required outside `localhost`
and literal IPv4/IPv6 loopback addresses; a remote DNS name does not become a
loopback exception merely because it resolves locally.

The adapter owns only `<base>-private` and `<base>-public`. Use a dedicated
namespace and service identity that permits the required bucket, versioning,
policy and object operations on those buckets. Readiness checks/creates both
buckets, verifies that neither has versioning, removes the private bucket policy
and installs a public `s3:GetObject` policy only on the public bucket. Other
service identity policies, grants and external controls remain the operator's
responsibility. Do not share these buckets with unrelated writers or policies.
Readiness can fail after earlier bucket/policy operations succeeded; it is not a
transaction and must not be reported as ready after a failure.

`put` uses conditional creation (`If-None-Match: *`). A collision fails without
overwriting the existing bytes; concurrent writers must handle that failure.
`get` buffers the complete SDK response into a `Uint8Array` and propagates stream
failures. This is not an unbounded-file streaming interface. Deleting an absent
object follows S3's idempotent delete behavior, unlike the local adapter's
missing-file failure. `storage/operations.ts` can provide safe diagnostics
without replacing the original operation failure.

## Hard deletion and public references

Soft deletion is prohibited. Readiness and every write/delete require an absent
bucket versioning status. Enabled, suspended and other present statuses fail;
the adapter never disables versioning or sends a delete intended to create a
versioning marker. Keep bucket configuration under administrative control:
checking versioning and then deleting is not atomic against a concurrent
privileged configuration change. This adapter does not manage pre-existing
version histories. Business-reference checks still belong to application and
persistence rules; storage deletion does not authorize deleting a business record.

Only the owned public bucket can produce a public MinIO URL. Private references
have no public URL. Bucket/key validation rejects foreign buckets, empty or dot
segments, backslashes, control characters and oversized keys. Public base URLs
must use HTTPS outside loopback, with no credentials, query or fragment. Each key
segment is percent-encoded separately so Unicode and reserved characters retain
their object-key meaning. A URL is a reference, not proof that an object exists.

## Validation and its limits

Run the complete [canonical gate](../.agents/validation.json) on the exact
proposed tree before an authorized commit or PR handoff. Filesystem tests use
fresh owned temporary directories and remove their fixtures. Object-storage
tests use the real S3 SDK against an owned loopback HTTP server, with synthetic
credentials and independently verified request signatures. Empty isolated AWS
profile files, disabled metadata discovery and an external-network guard keep
the tests independent of private host state. The fixture and test-owned resources
are cleaned up after execution.

Tests cover bucket creation/failures, policies, versioning refusal, conditional
and concurrent creation, exact empty/binary/Unicode bytes, reads/deletes, URL
validation and response failures. They establish SDK/protocol behavior against
the synthetic fixture. They do not establish compatibility with a deployed
MinIO release, operational credentials/TLS, external policy enforcement, HTTP
authorization or a runnable application. Deployment integration with disposable
real services and the full HTTP/auth/database/storage gate remains required
before `applicationReady` can become true.
