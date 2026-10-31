# API imports

Use explicit relative .ts module paths. Same-directory imports use ./; cross-directory
imports use the actual relative path. This API has no frontend @/ alias.

Application services import only other application modules, pure local src/contracts
and appropriate native utilities. The message vocabulary module is type-only.
Infrastructure implements the feature ports. HTTP routes consume application services;
logging/localization are their only infrastructure exceptions. Keep SDK/ORM/auth and
HTTP/browser types out of application. Read [backend](backend.md).

Wire contracts may import only other pure local contract modules. Runtime catalogs
contain plain API data and erased application message types; the translation engine
stays in the infrastructure adapter. Never import source from another checkout or
restore shared package aliases. scripts/check-boundaries.mjs checks source containment
and contract purity; src/test/architecture/boundaries.test.ts checks the narrower layer boundaries.
Import ordering is enforced by eslint-plugin-simple-import-sort.

## Erased type imports and exports

Use `import type` or `export type` when every symbol is used only as a type.
When a module provides both kinds, keep its type import separate from the runtime
import; mark type-only names in mixed re-exports with `type`. Classes, enum values,
schema objects and other emitted runtime references need ordinary imports.
Do not replace direct imports with shortcut barrels or introduce a runtime
dependency from application code merely to reuse a type. The existing boundary
checks also inspect type-only, dynamic and re-export edges.
