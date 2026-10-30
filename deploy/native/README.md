# API native Linux deployment reference

[English](README.md) · [فارسی](README.fa.md)

Use Linux with systemd, Nginx, Certbot and Node.js 24 matching `.nvmrc`. Build/package
on the same OS/CPU as the runtime because dependencies may contain native binaries.
A Windows-installed dependency tree is not a Linux release.

These templates do not establish production readiness. Real OTP delivery and
deployed integration remain unverified. This source snapshot includes [API](api.env.example)
and [host](hosts.env.example) environment templates. Copy and customize them in
protected files outside Git; never commit real secrets or host-specific configuration.

From a trusted source checkout run `npm ci`, the relevant validation profile, and
`npm run deploy:package -- --release=RELEASE_ID`. Packaging is exclusive and never
overwrites a release. Copy the complete output to `/srv/kernel-api/releases/RELEASE_ID`,
verify its checksum, and install production dependencies from its `api` folder:

```sh
npm ci --omit=dev
```

Keep code read-only to the runtime user. Create system user/group kernel-api,
root-owned `/srv/kernel-api/releases` and protected `/etc/kernel-api`, plus
`/var/lib/kernel-api` and `/var/lib/kernel-api/uploads` owned by kernel-api with mode 0700. Create `/srv/kernel-api/current` as a symlink to the selected immutable release.
Create a root-owned `/etc/kernel-api/api.env` with mode 0600 from your protected
configuration source.
Use real generated credentials, an immutable release ID, public HTTPS API origin,
exact allowed frontend origins and absolute durable DB/storage paths. These are
systemd environment files: NAME=value assignments without shell export/expansion.
No source-tree development env is loaded by production units or bootstrap.

Return to the trusted source checkout to run the renderer; the packaged `api`
directory does not include it or the Nginx templates.
For initial TLS only, set API_HOST in a public hosts file and render the fixed
`bootstrap` template. The renderer reads public settings from stdin and writes
the rendered configuration to stdout. Use an exclusive temporary file, check
the command succeeds, then inspect it before installation; do not redirect
directly over an existing configuration. For example:

```sh
render_tmp=$(mktemp)
npm run --silent deploy:render -- --template bootstrap < /path/to/public-hosts.env > "$render_tmp"
```

Remove the temporary file if rendering fails or after installation. Install the resulting HTTP-only ACME challenge
server in Nginx, create `/var/www/letsencrypt`, run `nginx -t` and reload. Then issue:

```sh
sudo certbot certonly --webroot -w /var/www/letsencrypt -d api.example.com
sudo certbot renew --dry-run
```

Provide a public configuration containing the hostname, certificate paths and release ID,
without credentials. Repeat the rendering command with `--template kernel` and a new
exclusive temporary file; inspect output, install in the Nginx http context,
run `nginx -t` and reload. Replace the bootstrap server rather than keeping duplicate
API blocks. Renewal must reload Nginx after publishing updated certificates:
`certbot renew --deploy-hook 'systemctl reload nginx'`. No certificate key is stored
inside the repository or release. Only Nginx binds public ports; the unit forces the
API to listen on `127.0.0.1:3000`, regardless of HOST or PORT in its environment file.
Its ingress cap defaults to 6 MiB for a 5 MiB application upload cap.

The complete template rejects unknown HTTP hosts and TLS names. When integrating
several independently hosted apps into one Nginx instance, keep only one default
rejection pair per listen address and merge the named app blocks deliberately.

Before starting a fresh installation, validate protected production configuration
and bootstrap only if there are no users. From an authorized root operator shell,
use a transient service with the runtime identity and protected environment:

```sh
systemd-run --unit=kernel-api-validate --collect --wait --pipe --property=User=kernel-api --property=WorkingDirectory=/srv/kernel-api/current/api --property=EnvironmentFile=/etc/kernel-api/api.env /usr/bin/node scripts/validate-deployment-env.mjs api
systemd-run --unit=kernel-api-bootstrap --collect --wait --pipe --property=User=kernel-api --property=WorkingDirectory=/srv/kernel-api/current/api --property=EnvironmentFile=/etc/kernel-api/api.env /usr/bin/node src/bootstrap-admin.ts < /secure/path/initial-admin.json
```

The protected JSON uses first_name, last_name, mobile (09 plus nine digits),
username and an 8–128-character password without boundary whitespace. No credentials
in command arguments or logs. Bootstrap disables seeding, migrates, atomically
creates one system administrator/credential, issues no session, and refuses any
existing user. Remove protected temporary input according to your secret policy.

Install `systemd/kernel-api.service` as `/etc/systemd/system/kernel-api.service`,
then `systemctl daemon-reload` and `systemctl enable --now kernel-api`. ExecStartPre
validates the environment on every start; the unit restricts writable state to
`/var/lib/kernel-api`, runs unprivileged and logs to journald. Check `systemctl status`,
`journalctl -u kernel-api`, `deploy:health -- api`, public HTTPS login/files and the
release marker before allowing traffic. [Recovery](../../docs/backup-restore.md)
and [upgrade/rollback](../../docs/release-operations.md) are mandatory operator steps.
No real OTP provider or backup schedule is installed by this procedure.
