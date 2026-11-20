# TypeScript

Follow the [published scope](../README.md#published-scope).

## Object shapes

Use `type` for object shapes.

```ts
// Prefer
type User = { id: string; name: string };

// Avoid
interface User {
  id: string;
  name: string;
}
```

Reserve `interface` for class contracts or external declaration merging.

## Type safety

- Prefer narrowing over `as` casts.
- Use `as` only at boundaries such as route keys, parser output, or third-party APIs.
- Avoid `any` unless the surrounding code already requires it.
- Do not add optional chaining or fallback values for values whose types are non-optional.

## Literal unions and configs

Derive unions from const values when it keeps types and runtime data in sync.

```ts
const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];
```

Use `satisfies` for config objects when you want type validation without losing literal types.

```ts
const routes = {
  auth: { path: "/auth" },
  root: { path: "/" },
} as const satisfies Record<string, { path: string }>;
```

## Exhaustiveness

Prefer `Record<Union, Value>` for finite mappings so TypeScript forces every case to be handled.

```ts
type Status = "active" | "inactive";

const statusLabel: Record<Status, string> = {
  active: "Active",
  inactive: "Inactive",
};
```

## Runtime validation

Validate untrusted input at the boundary. Fail clearly when required internal
state or configuration is missing. Handle genuinely optional data explicitly.

## Prefer optional values over null

- Prefer not to use `null` in application code. Represent an absent value with
  an optional field, optional parameter, or `undefined` instead of a `null`
  union.
- Do not combine optional syntax with a nullable union such as
  `value?: string | null`; use `value?: string`.
- Follow the [HTTP contract rules](api-collection.md) for omission and explicit
  `null` values in API payloads and examples.
- Normalize nullable external response fields at the API boundary before they
  enter domain models or application state.
- Keep `null` only when it has a distinct domain or protocol meaning, or when a
  browser API or third-party library requires it. Keep that exception local to
  the boundary and do not spread its nullable type through the application.

## Shared types

- Follow the [backend ownership rules](backend.md#ownership-and-dependency-direction)
  for application models, feature ports and HTTP DTOs. Contract examples include
  [files](../../src/contracts/files.ts), [contents](../../src/contracts/contents.ts)
  and [FAQs](../../src/contracts/faqs.ts).
- Keep genuinely reused permissions, profile bounds and OTP concepts in their
  own local contract modules. Follow the [module path rules](imports.md#module-paths).
- Derive supported locale types from the
  [canonical language list](localization.md#message-ownership). Derive permission
  types from the pure local permission vocabulary.
- Use singular names for domain models, `Query` for query inputs, `Request` for
  write bodies and `Response` for a wire wrapper or materially different response
  shape. Preserve existing public names and contract fields during unrelated work.
- Keep the model name singular in a query type. Preserve boundary ownership
  during unrelated work. Naming alone does not justify a contract migration.

## Derive types from their source of truth

- When an existing domain or library type already owns a value's shape, derive
  the consumer type from it instead of repeating a primitive, union, object
  shape, or function signature manually.
- Use indexed access types such as `User["id"]` for domain fields and utility
  types such as `Parameters<>` and `ReturnType<>` when they keep consumers
  synchronized with the owning contract.
- Do not duplicate a type merely to make a local annotation shorter. Prefer a
  named derived alias when the inline expression would hurt readability.
- Define a standalone type when it represents a genuinely independent domain
  concept or public boundary; do not derive unrelated concepts solely because
  their current representations happen to match.

```ts
// Prefer
type DeleteUserId = User["id"];

// Avoid: this can silently diverge if the domain identifier changes.
type ManuallyTypedUserId = string;
```

Use `Awaited<>` when deriving the result of an asynchronous operation.
