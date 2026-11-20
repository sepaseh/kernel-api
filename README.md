# Kernel API

Kernel API is the standalone TypeScript backend for Kernel applications. It
serves HTTP with Hono, manages sessions with Better Auth, persists application
data with libSQL and Drizzle, and stores files on disk or in MinIO.

## Run locally

1. Use the Node.js version in [.nvmrc](.nvmrc). From the repository root, install
   the locked dependencies and start the disposable API fixture.

   ```sh
   npm ci --strict-peer-deps --ignore-scripts --no-audit --no-fund
   npm run test:fixture:website
   ```

2. Open `http://127.0.0.1:3100/health`. Once the server is ready, it returns
   HTTP 200 and `{"status":"ok"}`.
3. Stop the fixture with **Ctrl+C**. The runner closes the API and removes
   its temporary database and uploads.

For a server with your own local configuration, follow the
[development guide](docs/development.md). To send API requests and inspect
saved responses, open the [Bruno collection](collection/README.md).

## Included capabilities

The API supports authentication and account management, users and roles,
calendar dates, system settings and languages, and file management.
Content management includes sortable categories, sanitized rich-text content
with public cover images, and sortable FAQs. The
[collection guide](docs/collection-guide.md) links to the available requests
and contract tests.

The [publication inventory](.github/bootstrap-policy.json) defines the
`local-runtime` phase and all eleven Bruno request groups. It records
`applicationReady` as `false`. Production OTP delivery is unavailable. Deployed
integrations and production readiness require separate verification.

## Documentation

- [Documentation index](docs/README.md) for guides by task.
- [Architecture](docs/architecture.md) for system boundaries and source ownership.
- [Development](docs/development.md) for local setup and source changes.
- [Validation](docs/validation.md) for required checks and evidence.
- [Deployment](docs/deployment.md) for packaging and deployment.

## Get help and contribute

Use repository issues for bugs and feature requests. Report suspected
vulnerabilities privately. [Issues](https://github.com/sepaseh/kernel-api/issues) · [Security policy](SECURITY.md)

Follow the contribution workflow to propose a change. Assistants start at the
repository's assistant entry point. [Contributing](CONTRIBUTING.md) · [Assistant entry point](AGENTS.md)
