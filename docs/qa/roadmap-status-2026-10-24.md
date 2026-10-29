# API disposition of 137 topics

[English](roadmap-status-2026-10-24.md) · [فارسی](roadmap-status-2026-10-24.fa.md)

This is a historical record concerning 24 October 2026. Its execution claims have not been independently verified and do not describe the current project state. See [validation](../validation.md) for current checks.

Date: 2026-10-24.

This table keeps all 137 topic titles and API dispositions. It describes API ownership, implemented foundations, workflows, conditions and operator work. A topic is not automatically a product requirement or a requirement to install a technology. The classifications do not record a new test run.

The [machine-readable table](roadmap-status-2026-10-24.json) contains only API evidence paths, relative to this repository. Use the [requirements audit](requirements-audit-2026-10-24.md), [task navigation](../source-navigation.md) and dated verification reports for behavior and actual execution limits.

| Code | Meaning                           |
| ---- | --------------------------------- |
| I    | Implemented foundation            |
| W    | Documented workflow               |
| C    | Conditional feature               |
| P    | Foundation; condition remains     |
| R    | Configured; remote run pending    |
| D    | Intentionally deferred            |
| S    | Addressed by current architecture |
| N    | Outside this owner                |

| ID   | Topic                                     | API | Disposition and boundary                                                                                                                    |
| ---- | ----------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| F001 | Next.js — Pages Router                    | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F002 | Browser APIs                              | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F003 | React                                     | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F004 | TypeScript                                | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F005 | JavaScript                                | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F006 | HTML                                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F007 | CSS                                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F008 | Server & Client Components                | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F009 | Rendering Strategies (CSR, SSR, SSG, ISR) | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F010 | Server Actions & Route Handlers           | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F011 | Streaming & Suspense                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F012 | Cache & Revalidation                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F013 | Error & Loading Boundaries                | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F014 | Next.js — App Router                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F015 | State Management                          | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F016 | Design Systems                            | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F017 | Monorepo                                  | S   | This API owns one root package, source, contracts and catalogs. npm workspaces are outside its architecture.                                |
| F018 | Micro Frontends                           | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F019 | Module Federation                         | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F020 | Component Architecture                    | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F021 | Domain-driven Frontend Architecture       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F022 | Dependency Boundaries                     | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F023 | Frontend Error Handling Architecture      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F024 | Unit Testing                              | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F025 | Integration Testing                       | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F026 | E2E Testing                               | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F027 | Vitest                                    | I   | Application, HTTP and catalog checks use Node test; tooling checks also use Vitest. See the canonical validation commands.                  |
| F028 | React Testing Library                     | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F029 | Playwright                                | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F030 | MSW                                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F031 | TDD                                       | W   | A reusable documented practice, not a new runtime package or proof of every historic action.                                                |
| F032 | Testing Strategy                          | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F033 | Component Testing                         | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F034 | Visual Regression Testing                 | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F035 | Accessibility Testing                     | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F036 | Storybook                                 | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F037 | Contract Testing                          | I   | API HTTP tests and Bruno document the existing provider contract; automated Pact provider verification is not implemented.                  |
| F038 | Flaky Test Management                     | W   | A reusable documented practice, not a new runtime package or proof of every historic action.                                                |
| F039 | Core Web Vitals                           | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F040 | Browser Rendering Pipeline                | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F041 | Bundle Optimization                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F042 | Code Splitting                            | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F043 | Frontend Caching Strategies               | I   | Public/static caching is distinct from private sessions/live settings; no-store boundaries are tested.                                      |
| F044 | Image & Font Optimization                 | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F045 | Performance Budgets                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F046 | WCAG                                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F047 | Keyboard Navigation                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F048 | Screen Readers                            | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F049 | ARIA                                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F050 | XSS                                       | I   | Current context-specific rendering/input/gateway protections exist; no blanket rich-HTML sanitizer claim.                                   |
| F051 | CSP                                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F052 | OAuth/OIDC                                | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F053 | Authentication                            | P   | Password/session/account flows exist; real OTP delivery is API/provider-owned and still unconfigured.                                       |
| F054 | Authorization                             | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F055 | CSRF                                      | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F056 | Secure Cookies                            | I   | The API preserves native authentication cookie headers; client credential storage and proxy adaptation remain consumer responsibilities.    |
| F057 | Dependency & Supply-chain Security        | P   | Audit gates exist; API retains four MinIO moderate findings and zero high/critical.                                                         |
| F058 | Secret Management                         | P   | Safe current env/text/file contexts exist; managed secrets or rich-HTML/CMS policies require a real deployment/content need.                |
| F059 | Clickjacking Protection                   | I   | Current context-specific rendering/input/gateway protections exist; no blanket rich-HTML sanitizer claim.                                   |
| F060 | Input Validation                          | I   | Existing forms/wire limits align with authoritative API input/type/size validation.                                                         |
| F061 | Sanitization                              | P   | Safe current env/text/file contexts exist; managed secrets or rich-HTML/CMS policies require a real deployment/content need.                |
| F062 | Git                                       | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F063 | GitHub Actions                            | R   | Pinned workflows exist; hosted activation, credentials and branch protection were not executed here.                                        |
| F064 | Docker                                    | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F065 | CI/CD                                     | R   | Pinned workflows exist; hosted activation, credentials and branch protection were not executed here.                                        |
| F066 | Turborepo                                 | D   | Intentionally deferred for this starter; installing every learning-roadmap technology is not a requirement.                                 |
| F067 | pnpm                                      | D   | Intentionally deferred for this starter; installing every learning-roadmap technology is not a requirement.                                 |
| F068 | REST                                      | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F069 | GraphQL                                   | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F070 | gRPC                                      | D   | Intentionally deferred for this starter; installing every learning-roadmap technology is not a requirement.                                 |
| F071 | Databases                                 | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F072 | Backend & Distributed Caching             | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F073 | Message Queues                            | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F074 | AI SDK                                    | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F075 | MCP                                       | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F076 | Tool Calling                              | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F077 | Streaming UI                              | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F078 | RAG                                       | D   | Intentionally deferred for this starter; installing every learning-roadmap technology is not a requirement.                                 |
| F079 | Prompt Engineering                        | P   | Portable guidance/oracles exist; controlled source evaluation is distinct from automatic host discovery/all-assistant benchmarking.         |
| F080 | System Design                             | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F081 | Requirements Analysis                     | W   | A reusable documented practice, not a new runtime package or proof of every historic action.                                                |
| F082 | Technical Planning                        | W   | A reusable documented practice, not a new runtime package or proof of every historic action.                                                |
| F083 | Code Review                               | W   | A reusable documented practice, not a new runtime package or proof of every historic action.                                                |
| F084 | Mentoring                                 | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F085 | Architecture Decision Making              | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F086 | Technical Communication & Documentation   | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F087 | HTTP/HTTPS                                | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F088 | Cookies & Sessions                        | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F089 | CORS                                      | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F090 | Browser Caching                           | I   | Public/static caching is distinct from private sessions/live settings; no-store boundaries are tested.                                      |
| F091 | JavaScript Event Loop                     | W   | A reusable documented practice, not a new runtime package or proof of every historic action.                                                |
| F092 | Web Storage                               | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F093 | Web Workers                               | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F094 | WebSockets                                | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F095 | Server-Sent Events                        | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F096 | Service Workers                           | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F097 | Progressive Web App                       | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F098 | Web Push Notifications                    | D   | Intentionally deferred for this starter; installing every learning-roadmap technology is not a requirement.                                 |
| F099 | Browser Extensions                        | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F100 | Web Media APIs & Playback                 | C   | Generic upload/storage is not a complete DAM/CMS/video pipeline; these remain product-dependent.                                            |
| F101 | TV & Remote-control UI Engineering        | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F102 | Cross-platform Frontend Adapters          | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F103 | Chrome DevTools                           | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F104 | Network Debugging                         | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F105 | Performance Profiling                     | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F106 | Memory Leak Debugging                     | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F107 | Source Maps                               | P   | Local diagnostics/report adapters exist; source-map uploads/collectors/alerts depend on deployment.                                         |
| F108 | Error Monitoring                          | P   | Local diagnostics/report adapters exist; source-map uploads/collectors/alerts depend on deployment.                                         |
| F109 | Logging & Diagnostics                     | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F110 | Real User Monitoring                      | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F111 | Data Fetching Patterns                    | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F112 | Server State Management                   | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F113 | Loading, Error & Empty States             | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F114 | Retry                                     | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F115 | Optimistic Updates                        | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F116 | Forms & Validation                        | I   | Existing forms/wire limits align with authoritative API input/type/size validation.                                                         |
| F117 | Pagination                                | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F118 | Race Conditions & Stale Data              | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F119 | Infinite Loading                          | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F120 | Timeout                                   | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F121 | Cancellation                              | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F122 | Responsive Design                         | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F123 | CSS Architecture                          | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F124 | UI Implementation from Design             | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F125 | Animation & Motion                        | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F126 | Internationalization                      | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F127 | SEO & Metadata                            | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F128 | Cross-browser Compatibility               | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F129 | Typography & Visual Hierarchy             | N   | Outside this API runtime; this topic requires no API implementation.                                                                        |
| F130 | Environment Configuration                 | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F131 | Deployment                                | P   | Docker/native tools and local verification exist; real systemd/ACME/production activation is not run.                                       |
| F132 | CDN & Edge Delivery                       | C   | Conditional on a real product/provider/hosting requirement; not a missing mandatory starter dependency.                                     |
| F133 | Feature Flags                             | C   | Simple validated deployment/indexing switches exist; a generalized flag platform is conditional.                                            |
| F134 | Release & Rollback Strategies             | I   | API tests cover local matched DB/object/session restore; real operational backups and production recovery remain operator responsibilities. |
| F135 | Dependency Management                     | I   | The appropriate current foundation exists; see the scoped source/test evidence, not a claim of every possible extension.                    |
| F136 | Package Publishing                        | D   | Intentionally deferred for this starter; installing every learning-roadmap technology is not a requirement.                                 |
| F137 | Incident Debugging                        | I   | API now tests local HTTP request/release/log incident correlation and recovery; production browser/collector/alerting remains conditional.  |
