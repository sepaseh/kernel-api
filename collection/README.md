# Kernel API Bruno collection

Use this collection to make local HTTP requests and inspect saved response
examples. The [publication inventory](../.github/bootstrap-policy.json) lists
the eleven published groups.

## Connect Bruno to the local API

1. Start the [disposable API fixture](../README.md#run-locally). For
   a separately configured server with synthetic data, follow
   [local development](../docs/development.md).
2. Install [Bruno](https://www.usebruno.com/), choose **Open Collection**, and
   open this `collection` directory.
3. Create or select a local environment. Set `base_url` to the local API URL,
   leave `access_token` empty, and set `origin` to an exact origin allowed by
   `SERVER_ALLOWED_ORIGINS` or `SERVER_ALLOWED_ORIGIN`. Include the scheme and
   any configured port. For the default fixture, use the API URL
   `http://127.0.0.1:3100` and the website origin `http://127.0.0.1:3101`.
4. Run [Login](auth/login/index.bru) with a synthetic account. Its saved input
   matches the seeded administrator in the disposable fixture. A successful
   response returns HTTP 200 and the request script puts its `access_token`
   in the active environment. Authenticated operations use this bearer token.

The collection sends `origin` as the `Origin` header so browser-style requests
using session cookies pass the origin check. Keep populated local environments,
account credentials and tokens outside version control.

## Find an operation

| Group                                    | Operations                                                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Account](account)                       | Current account, profile and username updates, email verification and mobile verification.                                  |
| [Authentication](auth)                   | Registration, login, OTP request, session refresh, password recovery and change, and logout.                                |
| [Calendar](calendar)                     | List, add and delete configured dates.                                                                                      |
| [Content categories](content-categories) | List, create, read, update, order and delete categories.                                                                    |
| [Contents](contents)                     | List and filter, create, read, update and delete rich-text entries with a category and public cover image.                  |
| [FAQs](faqs)                             | List, create, read, update, order and delete FAQ entries.                                                                   |
| [Files](files)                           | Upload, list with byte size and usage status, retrieve public content and delete unused files.                              |
| [Languages](languages)                   | List the supported languages with authentication.                                                                           |
| [Roles](roles)                           | List, create, read, update and delete roles. List available permissions.                                                    |
| [Settings](settings)                     | Read public settings and update themes, logos, image settings and the active language.                                      |
| [Users](users)                           | List, create, read, update and delete users. Manage status, administrator access, passwords, roles and mobile verification. |

Saved examples sit beside each operation and use the HTTP status code as the
filename. Errors shown in the examples use English. Settings success examples
illustrate Persian as the active language. A bodyless success has no JSON
example.

## Prepare request variables

Create synthetic data through the collection or load the [development seed](../docs/development.md)
in a disposable database.

- Set `user_id`, `role_id`, `file_id`, `content_id`, `content_category_id`
  and `faq_id` to the IDs returned by the relevant operations.
- For the two-record sort examples, also set `other_content_category_id` or
  `faq_second_id`. For larger lists, replace the example with each current ID
  exactly once in the desired order.
- Set `calendar_date` to the date to delete in `YYYY-MM-DD` format.
- Select a synthetic local file in [Upload File](files/upload/index.bru).
  Use multipart `context=contents` for a public cover or `context=logo`
  for branding. Create a category, upload a cover and pass their IDs to
  [Create Content](contents/create/index.bru) as `content_category_id`
  and `cover_image_id`.

## Shared HTTP behavior

- Uninitialized startup returns a bodyless 503. Initialized responses carry
  `X-Request-Id` for [log correlation](../docs/backend-logging.md#request-correlation).
- The [HTTP transport guide](../docs/http-transport.md) explains origins, caching,
  translated error responses, attempt limits and the OTP resend cooldown.
- Follow [input validation](../docs/input-validation.md) for JSON body limits
  and [upload contexts](../docs/object-storage.md#upload-contexts) for file limits.
- [Mobile verification](../docs/http-transport.md#mobile-number-changes)
  requires issuing and confirming the code in the same session, for the same
  user, number and flow. Local OTP uses a configured development code.

See [changing contracts and handing them off to clients](../docs/collection-guide.md)
for the owning DTOs, routes and tests.
