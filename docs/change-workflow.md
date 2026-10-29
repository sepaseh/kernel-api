# Planning an API change

[English](change-workflow.md) · [فارسی](change-workflow.fa.md)

Record the requested behavior, repository owner, affected clients and observable
acceptance cases. Read the relevant contract, service, adapter and tests using
[source navigation](source-navigation.md). Preserve existing local changes and
exclude real credentials and private state from test fixtures.

Describe invalid input, authorization, data consistency and compatibility where
relevant. Identify migrations or rollout dependencies before implementation, then
run focused checks and the required [full validation](validation.md) before an
authorized handoff. Do not claim execution or remote approval that did not occur.
