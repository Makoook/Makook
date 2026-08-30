# Authentication implementation plan

No files, migrations, commits, or other repository changes will be made in the implementation-planning phase.

## A. Authentication flow: new users

1. Client calls `POST /auth/otp/request` with an email or phone identifier.
2. The API validates and normalizes the identifier using one shared normalization path.
3. No matching user exists:
   - Create a minimal provisional `User` containing only that normalized identifier.
   - The user remains `ACTIVE` but unverified (`emailVerifiedAt` / `phoneVerifiedAt` is `null`).
   - Create a single active OTP for that user and identifier type.
   - Send the OTP.
4. Return the same generic request response used for all identifiers.
5. Client calls `POST /auth/otp/verify`.
6. In one atomic operation:
   - Consume the valid OTP exactly once.
   - Set the appropriate verified timestamp.
   - Confirm the user is `ACTIVE`.
   - Create a session with the client-supplied optional `deviceId`.
   - Store only the refresh-token hash.
7. Return a new access JWT, refresh token, and session ID.

A provisional user that remains unverified for 30 days becomes eligible for cleanup.

## B. Authentication flow: existing users

1. Client calls `POST /auth/otp/request`.
2. Normalize and locate the existing user by the specified email or phone.
3. If the user is `ACTIVE`:
   - Invalidate any active unused OTP for that user and identifier type.
   - Create and deliver a replacement OTP.
4. If the user is `SUSPENDED` or `DELETED`:
   - Return the normal generic request response.
   - Do not issue a usable OTP or session.
5. On valid OTP verification for an active user:
   - Consume the OTP exactly once.
   - Set the matching verification timestamp only if it is currently unset; an already verified identifier stays verified.
   - Create a new session, preserving the supplied `deviceId`.
   - Return the token bundle.

Each successful OTP login creates a distinct session. Existing sessions remain independent.

## C. Exact API contracts

### `POST /auth/otp/request`

Request:

```json
{
  "type": "EMAIL",
  "identifier": "person@example.com"
}
```

or:

```json
{
  "type": "PHONE",
  "identifier": "+201000000000"
}
```

Success response: `202 Accepted`

```json
{
  "message": "If the identifier can be used, a verification code has been sent"
}
```

This response must be identical for:

- New identifiers
- Existing active users
- Suspended users
- Deleted users
- Identifiers for which delivery is throttled/suppressed

Invalid request syntax or invalid identifier format remains `400 Bad Request`.

### `POST /auth/otp/verify`

Request:

```json
{
  "type": "EMAIL",
  "identifier": "person@example.com",
  "code": "123456",
  "deviceId": "optional-client-device-id"
}
```

`deviceId` is optional. It remains opaque client-provided session metadata.

Success response: `201 Created`

```json
{
  "sessionId": "uuid",
  "refreshToken": "opaque-random-token",
  "accessToken": "jwt"
}
```

This intentionally matches the field names already returned by `/auth/refresh`.

All authentication failures return `401 Unauthorized` with the same public message:

```json
{
  "statusCode": 401,
  "message": "Invalid or expired verification code",
  "error": "Unauthorized"
}
```

Use this response for:

- Unknown identifier submitted directly to verification
- Incorrect code
- Expired code
- Used code
- Attempt-limited code
- OTP replay/concurrent loser
- Suspended or deleted user

Internal logs/metrics may retain the precise reason; the API must not expose it.

### `POST /auth/refresh`

Keep the existing request contract:

```json
{
  "sessionId": "uuid",
  "refreshToken": "opaque-random-token"
}
```

Success response: `201 Created`

```json
{
  "sessionId": "new-session-uuid",
  "refreshToken": "new-opaque-random-token",
  "accessToken": "new-jwt"
}
```

Failure response: `401 Unauthorized`

```json
{
  "statusCode": 401,
  "message": "Invalid session",
  "error": "Unauthorized"
}
```

The public refresh response should remain generic for unknown, expired, revoked, malformed, replayed, or mismatched credentials.

## D. Required service changes

### `OtpService`

Refactor it to support the passwordless authentication workflow:

- Centralize identifier lookup through the shared normalization facility.
- Add get-or-create provisional-user behavior to OTP request handling.
- Suppress usable OTP issuance for `SUSPENDED` and `DELETED` users while retaining the generic external response.
- Replace the current verification result of `void` with an internal authenticated/consumed result suitable for orchestration.
- Ensure successful consumption is conditional and atomic: valid code, active row, not expired, under attempt limit, and not previously used.
- Preserve six-digit OTPs, SHA-256 storage, five-minute expiry, and one active OTP per user/type.
- Make public verification failure messages/statuses uniform.
- Lock/consume an OTP when its attempt limit is reached, rather than leaving it active after the fifth failed attempt.
- Use timing-safe hash comparisons where values are compared in application code.

### `AuthService`

Add an authentication orchestration operation, conceptually:

```ts
authenticateWithOtp(type, normalizedIdentifier, code, deviceId?)
```

It will:

- Coordinate OTP consumption, user-status validation, verified timestamp update, and session creation in a single database transaction.
- Create the refresh token and store only its hash.
- Create the access JWT with `{ sub: userId, sid: sessionId }`.
- Return the exact OTP-verify token bundle.
- Preserve `deviceId` through initial session creation and all later rotations.
- Refactor session creation internally so it can participate in the OTP transaction.
- Make refresh rotation concurrency-safe and replay-aware.
- Use timing-safe comparisons for refresh hashes.

### Identity-related service support

Introduce one shared identity-normalization utility/service used by:

- `IdentityService.createUser`
- OTP request
- OTP verification
- Any later identity update endpoint

This avoids the current mismatch: identity creation trims and lowercases email, while OTP logic has its own local normalization and phone is only trimmed.

## E. Required controller changes

### `OtpController`

- Inject/access the authentication orchestration flow.
- Change `requestOtp` to return `202 Accepted` with the generic message.
- Change `verifyOtp` from a verification-only acknowledgment to a token-issuing authentication response.
- Accept optional `deviceId` during verification.
- Do not return accepted success for a nonexistent user submitted directly to verification.
- Map all authentication-related verification failures to the single generic `401` response.
- Continue letting DTO format validation produce `400`.

### `AuthController`

- Keep `/auth/refresh` request and success field names.
- Map refresh failures to one generic unauthorized response.
- No change is required to the endpoint path.

## F. Required DTO changes

### `RequestOtpDto`

Retain:

```ts
type: EMAIL | PHONE
identifier: string
```

Add validation through the shared normalizer rather than relying only on non-empty string validation.

### `VerifyOtpDto`

Retain:

```ts
type: EMAIL | PHONE
identifier: string
code: six-digit string
```

Add:

```ts
deviceId?: string
```

`deviceId` should be optional, string-valued, and non-empty when provided.

### `RefreshTokenDto`

The current fields remain correct:

```ts
sessionId: string
refreshToken: string
```

No client-visible refresh DTO expansion is required for this phase.

## G. Required Prisma/schema changes

One schema migration is required for replay-safe refresh-token family handling.

Add a session-family identifier to `Session`, for example:

```prisma
familyId String @default(uuid())
```

Add an index:

```prisma
@@index([familyId])
```

Behavior:

- A newly authenticated session starts a new `familyId`.
- A rotated session receives the same `familyId` as the session it replaces.
- If a rotated-out refresh token is replayed, revoke all still-active sessions in that one family only.
- This scopes replay impact to that login/device chain, not all sessions for the user.

No schema change is required for provisional-account cleanup: `createdAt`, `emailVerifiedAt`, `phoneVerifiedAt`, and the existing relations are sufficient to identify unverified accounts older than 30 days.

A separate cleanup job/service will be needed, but it does not inherently require a new database field.

## H. Guards and JWT validation architecture

Add a custom access-token guard for future protected endpoints.

Guard behavior:

1. Read `Authorization: Bearer <accessToken>`.
2. Verify signature and expiration using the existing `JwtModule` configuration and `JWT_ACCESS_SECRET`.
3. Require usable claims:
   - `sub`: user ID
   - `sid`: session ID
   - standard `iat` and `exp`
4. Attach a typed authenticated principal to the request, containing at least `userId` and `sessionId`.
5. Reject missing, malformed, invalid-signature, or expired access tokens with `401`.

The guard must not query `Session` or `User` on every request in this phase. Therefore:

- A revoked session cannot refresh immediately.
- Its existing access JWT can continue until its normal 15-minute expiry.
- Suspending/deleting a user must revoke that user’s active sessions so no new access JWT can be minted, while already-issued access JWTs age out naturally within 15 minutes.

Protected endpoints should explicitly apply this guard. Existing identity endpoints are currently unguarded and should be reviewed when protected user-facing behavior is introduced.

## I. OTP verification concurrency strategy

Use a transaction and conditional, single-winner database update.

For the currently active OTP record, successful consumption must succeed only when all of these are true at update time:

- The OTP ID is the active/current record for the user and identifier type.
- `usedAt IS NULL`.
- `expiresAt > now`.
- `attempts < maximumAttempts`.
- The supplied code hash matches.
- The related user is eligible to authenticate.

The success path conditionally marks `usedAt` and updates verification state. Only the transaction that changes one row is permitted to create the session.

If the conditional consume changes zero rows:

- Return the generic verification `401`.
- Do not create a session.
- Do not disclose whether the reason was bad code, expiry, prior use, competing verification, or account status.

Incorrect-code attempt updates must also be conditional and atomic. The transition reaching the maximum attempt count must consume/lock the OTP, so it cannot later be used successfully.

OTP consumption, verification timestamp update, active-user validation, and initial `Session` creation occur in the same transaction. This guarantees at most one successful authentication/session per OTP.

## J. Refresh-token rotation concurrency strategy

Use session families plus an atomic conditional rotation transaction.

1. Hash the supplied refresh token.
2. Atomically claim the session only if:
   - `id` matches;
   - stored token hash matches;
   - `revokedAt IS NULL`;
   - `expiresAt > now`.
3. The successful claimant:
   - Revokes the old session immediately.
   - Creates one successor session with:
     - a fresh random refresh token/hash;
     - the same `familyId`;
     - the same `deviceId`;
     - a fresh 30-day expiry.
   - Creates an access JWT whose `sid` is the successor session ID.
4. A competing request cannot claim the already-revoked old row and cannot create another successor.

Replay behavior:

- If the presented token matches a revoked member of a known session family, treat it as refresh-token replay.
- Revoke the currently active session(s) in that `familyId`.
- Return generic `401`.
- Do not affect the user’s unrelated session families/devices.

Use a database transaction with conditional updates/row-locking semantics appropriate to PostgreSQL. If serializable transaction retries are used, retry only transaction-conflict failures; never retry externally visible authentication operations indiscriminately.

## K. Account-status handling

| Status | OTP request | OTP verify | Refresh |
|---|---|---|---|
| `ACTIVE` | Issue/use OTP normally | May authenticate and create session | May rotate valid session |
| `SUSPENDED` | Generic accepted response; no usable OTP | Generic `401`; never create session | Revoke/prevent active refresh; generic `401` |
| `DELETED` | Generic accepted response; no usable OTP | Generic `401`; never create session | Revoke/prevent active refresh; generic `401` |

When an account transitions to `SUSPENDED` or `DELETED`, revoke all of its active sessions. This prevents further refreshes, while the existing 15-minute access-token policy remains unchanged.

## L. Identifier normalization strategy

Create a single normalization contract used everywhere.

### Email

- Trim surrounding whitespace.
- Convert to lowercase.
- Validate email format.
- Persist and look up the resulting normalized value.

This matches the existing identity creation intent.

### Phone

- Require callers to provide an already canonical E.164 phone number, including the leading `+`.
- Normalize only surrounding whitespace, which is explicitly safe.
- Reject non-E.164 values consistently.
- Use the identical canonical value for user creation, lookup, OTP delivery, verification, and later identity updates.

This policy is enforced consistently by identity creation, OTP request, OTP lookup, and OTP verification boundaries.

## M. Test plan

### OTP request tests

- New normalized email creates one provisional user and one OTP.
- New normalized phone creates one provisional user and one OTP.
- Existing user does not get duplicated.
- Re-request invalidates the previous unused OTP of the same type.
- Email variants normalize to the same user.
- Equivalent phone inputs normalize to the same canonical user.
- New, existing, suspended, deleted, and throttled identifiers receive the same public request response.
- Suspended/deleted users do not receive a usable OTP.
- A provisional unverified account older than 30 days is selected by the cleanup policy.

### OTP verification tests

- Valid OTP for a new email user marks email verified and returns session/token bundle.
- Valid OTP for a new phone user marks phone verified and returns session/token bundle.
- Valid OTP for an existing user creates a new session.
- Verifying one identifier is sufficient to authenticate.
- Existing verified timestamp is retained rather than overwritten unnecessarily.
- The session stores only the refresh-token hash.
- Returned JWT includes the created user ID as `sub` and new session ID as `sid`.
- Unknown identifier, wrong code, expired code, used code, locked code, suspended user, and deleted user all return the same public `401` response.
- Wrong attempts increment correctly.
- The maximum attempt transition locks/consumes the OTP.
- Used OTP cannot create another session.
- Two simultaneous valid OTP verification requests produce exactly one successful authentication and one session.

### Refresh tests

- Successful rotation creates a successor session and returns its session ID, access token, and new refresh token.
- Rotation preserves `deviceId`.
- Rotation preserves `familyId`.
- Old session becomes revoked immediately.
- Old refresh token/session pair cannot be reused.
- Two simultaneous refresh calls using one valid pair result in at most one successful rotation.
- Replay of a rotated-out refresh token revokes the active session(s) only within that family.
- Replay does not revoke the user’s other independent session families.
- Revoked, expired, invalid, unknown, and replayed refresh credentials produce generic `401`.

### JWT guard tests

- Valid bearer JWT grants access to a protected test endpoint.
- Missing, malformed, expired, and invalid-signature JWTs are rejected.
- Guard exposes `sub` and `sid` as the authenticated request principal.
- Revoking a session prevents refresh but does not invalidate its already-issued access JWT before expiry, matching the stated policy.

### Status-transition tests

- Suspending a user revokes active sessions.
- Deleting a user revokes active sessions.
- Neither status can create a session through OTP verification or refresh.

## N. Migration requirements

A Prisma migration will be required only for session-family support:

- Add `Session.familyId`.
- Give existing sessions a valid family ID during migration/backfill.
- Add an index on `familyId`.

No migration is required for OTP authentication itself, provisional users, verified timestamps, or 30-day eligibility checks because the existing `User`, `Session`, and `VerificationCode` schema already contains the required core fields.

## Confirmed provisional-account cleanup policy

Provisional users that remain unverified for 30 days must be permanently deleted. They must not be converted to `DELETED`, because the current unique email and phone constraints would prevent identifier reuse. No schema migration is required solely for this cleanup policy.
