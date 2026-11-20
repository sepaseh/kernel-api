# Documentation index

Use this index to find the guide for your task.

The [publication inventory](../.github/bootstrap-policy.json) defines the source and
Bruno request groups documented here.

## Install and run

- [Try the API with disposable fixtures](../README.md#run-locally) or [configure and run the local API](development.md).
- [Open Bruno and send your first request](../collection/README.md).

## Explore capabilities

- [Find HTTP requests, examples and client handoff guidance](collection-guide.md).
- [Check HTTP behavior, errors and limits](http-transport.md) and [input validation and normalization](input-validation.md).
- [Trace sign-in, verification and file uploads](sequences.md) and [check the response-language policy](localization.md).
- [Understand architecture and dependency direction](architecture.md).
- [Review the database schema and migrations](database-schema.md), [authentication and OTP adapters](auth-adapters.md) and [object storage and file lifecycle](object-storage.md).
- [Find structured logging and request correlation](backend-logging.md).

## Work with the source

- [Find source owners and their tests](source-navigation.md) and [plan and implement a feature change](feature-development.md).
- [Choose and write tests](testing.md) and [diagnose test failures](test-reliability.md).
- [Validate a source change](validation.md) and [prepare a contribution](../CONTRIBUTING.md).
- [Verify branch protection and required checks](branch-protection.md) and [check SonarQube Cloud and CodeRabbit evidence](sonarqube.md).
- [Review security controls and evidence](security/reviews.md), the [threat model](security/threat-model.md) and the [authentication review](security/authentication-review.md).
- [Read assistant instructions](../AGENTS.md) and [evaluate how an assistant discovers rules](../.agents/evaluation/README.md).
- [Report a security vulnerability](../SECURITY.md).

## Package and deploy

- [Choose a deployment path and verify the runtime](deployment.md), then [configure Docker](../deploy/docker/README.md) or [configure native Linux hosting](../deploy/native/README.md).
- [Package, activate or roll back a release](release-operations.md) and [publish release metadata](releasing.md).
- [Back up and recover database and object data](backup-restore.md).
