# Input validation

[English](input-validation.md) · [فارسی](input-validation.fa.md)

The reused profile-name bound lives in `src/contracts/profile.ts`; wire DTOs live
in the owning `account.ts`, `auth.ts` and `settings.ts` contract modules. Application
validation trims strings before checking length and distinguishes omitted/blank
optional patches (preserve existing value) from supplied nonstrings or out-of-bound
values (reject before any partial write). Registration checks name/password policy
before consuming OTP or writing through the auth provider. Account and managed-user
profile updates share those limits. Database constraints and transactions remain
separate protections.

JSON request bodies handled by the API require application/json and are bounded to
64 KiB of actual bytes, including streams without Content-Length. The upload route
authenticates first, then bounds actual multipart bytes to the configured file limit
plus 64 KiB for framing and fields before parsing. The
application separately validates file size before and after reading the file.
The default Nginx envelope is 6 MiB around the default 5 MiB application upload
limit; keep these values aligned deliberately. Run relevant validation and HTTP
tests and `npm run validate -- full` before an authorized commit or PR handoff.
Review HTTP compatibility for affected consumers.

## Profile-name behavior

The bound is 1,000 JavaScript UTF-16 code units after trimming, rather than bytes
or visible graphemes. Registration, user creation, managed-user updates and account
profile updates use the same constant.

| Input                                     | Creation/registration | Profile/user patch      |
| ----------------------------------------- | --------------------- | ----------------------- |
| Nonblank trimmed string up to 1,000 units | Accepted              | Updates the field       |
| More than 1,000 units                     | 400                   | 400; no partial write   |
| Omitted, empty or whitespace-only         | 400; required         | Existing value retained |
| Number, boolean, array, object or null    | 400                   | 400; no partial write   |

A patch needs no second name when only one is supplied. Blank names retain their
existing values when another supported update is supplied; a request with no effective
supported fields fails with 400. Mobile changes also require verification of the new number as
described in [HTTP transport](http-transport.md#mobile-number-changes). Unknown fields are not persisted; this does not
mean all endpoints reject unknown keys. Existing stored values are not rewritten.
Errors keep the message envelope, request ID, statuses and configured language.

JSON roots must be non-null objects. Malformed JSON, arrays and primitive roots
receive 400, unsupported media types 415 and oversized bodies 413. Actual streamed
bytes enforce the 64 KiB cap even with an absent or misleading Content-Length.
