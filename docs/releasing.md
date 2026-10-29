# Release handoff

[English](releasing.md) · [فارسی](releasing.fa.md)

Use a reviewed change, verified checks and an explicitly authorized PR or merge.
The [release operations guide](release-operations.md) describes artifact handling,
compatibility and rollback; [branch protection](branch-protection.md) describes
the remote checks that must be verified rather than inferred from local files.

Local tests and checked-in templates do not prove a deployed release or production
OTP delivery. Never publish credentials, private state or test fixtures as release
artifacts.
