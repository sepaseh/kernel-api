# Runtime sequences

[English](sequences.md) · [فارسی](sequences.fa.md)

Login flows HTTP parsing/origin checks → application policy → Better Auth gateway
→ credentials/session persistence → native cookie headers and compatible token DTO.
Consumers may use bearer tokens or a same-origin HttpOnly-cookie proxy; those
adapters belong to the independently maintained clients. Refresh returns the existing opaque session token: JWT
refresh rotation or reuse detection is not implemented. Logout is idempotent and
expires the provider's real secure-cookie names. Password change/recovery update
credentials and revoke all old sessions together.

A management mutation authenticates and authorizes and invokes its feature service.
Operations that can affect the last administrator reread that state inside the write transaction. A preflight
query or hidden frontend action cannot establish this invariant. Upload checks
public/private policy, writes object bytes, persists metadata and compensates if
metadata fails. Private metadata exposes no public URL; no private-download HTTP
endpoint exists.

The API binds its HTTP listener before database or storage initialization. Until
initialization completes it returns a non-cacheable 503. It initializes the database
with migrations and preserved settings, prepares storage, then serves the composed
application. Shutdown closes resources with bounded handling.
[Architecture](architecture.md) defines service and adapter ownership.
