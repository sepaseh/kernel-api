# ADR 0001: API runtime boundary

[English](0001-independent-runtimes.md) · [فارسی](0001-independent-runtimes.fa.md)

Status: accepted. The API owns authentication, DB access, reviewed SQL migrations
and storage. HTTP consumers use explicit configured origins and compatible
request/response contracts. Frontend rendering does not belong in the API runtime.

This repository builds one API with a root npm package and lockfile. Source
contracts and catalogs are local modules. See [repository ownership](0005-independent-repositories.md)
and [architecture](../architecture.md).
