# Input validation

HTTP adapters check the request format and size. Application services validate
feature fields and enforce business requirements. See the
[Bruno operations](../collection/README.md) for endpoint-specific fields and
statuses.

## Request bodies

JSON requests require `Content-Type: application/json` and a non-null object.
Malformed JSON, arrays and primitive roots return 400. Unsupported media types
return 415. Bodies above 64 KiB of actual bytes return 413, even with an absent
or misleading `Content-Length`.

Uploads use [multipart and context limits](http-transport.md#file-uploads).
The default Nginx envelope is 6 MiB and the default application upload limit
is 5 MiB. Keep the envelope large enough for the configured file limit and
multipart framing.

## Profile-name behavior

The [profile contract](../src/contracts/profile.ts) limits names to 1,000
JavaScript UTF-16 code units after trimming. Registration, user creation,
managed-user updates and account profile updates use the same limit.
Registration validates names and passwords before consuming an OTP or writing
through the auth provider.

| Input                                     | Creation/registration | Profile/user patch      |
| ----------------------------------------- | --------------------- | ----------------------- |
| Nonblank trimmed string up to 1,000 units | Accepted              | Updates the field       |
| More than 1,000 units                     | 400                   | 400; no partial write   |
| Omitted, empty or whitespace-only         | 400; required         | Existing value retained |
| Number, boolean, array, object or null    | 400                   | 400; no partial write   |

A patch needs no second name when only one is supplied. Blank names retain their
existing values when another supported update is supplied; a request with no effective
supported fields fails with 400. Mobile changes also require verification of the new number as
described in [HTTP transport](http-transport.md). Unknown fields are not persisted; this does not
mean all endpoints reject unknown keys. Existing stored values are not rewritten.
Errors keep the message envelope, request ID, statuses and configured language.

## Content and FAQ fields

- Content creation and updates require `title`, `excerpt`, `body`,
  `content_category_id` and `cover_image_id`. The API sanitizes `body` and
  returns 400 if no meaningful text remains. See the
  [rich-text contract](collection-guide.md#rich-text-content).
- FAQ creation and updates require a nonblank `question` and `answer`. After
  trimming, the [FAQ contract](../src/contracts/faqs.ts) allows up to 300 and
  5,000 UTF-16 code units, respectively. Missing or invalid text returns 400.
- Category and FAQ sort requests require an `ids` array of distinct nonblank
  strings. Malformed or duplicate IDs return 400. A valid array that differs
  from the current set of records returns 409.

For changes to validation, cover the fields and failure paths in the relevant
application and HTTP tests. Follow the [validation guide](validation.md) before
an authorized commit or PR.
