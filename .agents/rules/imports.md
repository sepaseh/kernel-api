# Import paths and ownership

Follow the [published scope](../README.md#published-scope) and
[backend dependency direction](backend.md#ownership-and-dependency-direction).

## Module paths

Use explicit relative `.ts` module paths. Same-directory imports use `./`.
Cross-directory imports use the actual relative path. Never import source from
another checkout or introduce a frontend `@/` or shared-package alias.

Wire contracts may import only other pure local contract modules. Import each
contract from its owning module and avoid shortcut or catch-all barrels.
Follow the [autofix workflow](code-quality.md#autofix-workflow) for import order.

## Erased type imports and exports

Use `import type` or `export type` when every symbol in the declaration is used
only as a type. Use value imports for runtime references such as components,
classes, enum values and schema objects.
When a module provides both kinds, use a separate type import and mark
type-only names in mixed re-exports with `type`.
Avoid introducing a runtime dependency from application code solely to reuse a
type. Application imports and exports from `src/application/localization.ts` must
be erased. Follow [message ownership](localization.md#message-ownership) for
catalog data and the runtime translation engine.

## Verify boundaries

Run `npm run check:boundaries` for the
[source containment and contract purity checks](../../scripts/check-boundaries.mjs).
Run the [architecture test](../../src/test/architecture/boundaries.test.ts) after
moving modules. It inspects static, type-only, dynamic and re-export edges and
global HTTP types in application code. Keep transport exceptions explicit and
preserve the enforced dependency direction when resolving failures.
