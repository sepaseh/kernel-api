# ADR 0002: Lightweight Clean API

[English](0002-lightweight-clean-api.md) · [فارسی](0002-lightweight-clean-api.fa.md)

Status: accepted. Application services and feature ports stay framework-free;
concrete adapters own persistence/auth/storage and Hono stays in presentation/http.
Manual composition connects them. HTTP may use logging and localization adapters; application imports no infrastructure.
The application localization vocabulary is consumed across that boundary only as erased types. Transaction-time invariants
stay in concrete persistence writes. Do not add generic repositories, DDD, CQRS,
mediators or a DI container. [Architecture tests](../../src/test/architecture/boundaries.test.ts)
and real-DB tests cover separate concerns.
