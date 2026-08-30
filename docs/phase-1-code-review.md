## A. REJECT

The core OTP verification path is mostly correct, but Phase 1 should not be committed yet because OTP request concurrency can leave multiple active OTPs, and several documented security properties are not actually implemented.

## B. Critical issues

- Concurrent `POST /auth/otp/request` calls can create multiple unused OTP rows.

  `requestOtp()` invalidates existing codes and creates a new code in one transaction, but concurrent transactions are not serialized. Two new codes can remain active. Because verification selects the “latest” row by `createdAt` without a deterministic unique constraint, concurrent verification can behave unpredictably.

- The implementation plan states timing-safe comparisons, but OTP hashes are compared with ordinary string equality:

  ```ts
  if (codeHash !== verificationCode.codeHash)
  ```

  This occurs in `otp.service.ts`.

## C. High-priority issues

- Phone “canonicalization” is only trimming:

  ```ts
  export function normalizePhone(phone: string): string {
    return phone.trim();
  }
  ```

  HTTP DTO validation requires E.164 format, but there is no actual conversion of equivalent phone representations. The implementation should either explicitly define “input must already be E.164” or use a real phone canonicalization library.

- `requestOtp()` creates users through `upsert`, but the user creation and OTP creation are separate transactions. If OTP persistence or delivery fails, a provisional user may remain without a usable OTP.

- Suspended/deleted status is checked before OTP consumption, then the active user row is updated and the session callback runs. The row update provides useful locking, but the status/session invariant is implicit and should be made more explicit and tested under concurrent status changes.

- Existing refresh behavior still exposes distinct errors (`Invalid session` vs `Invalid refresh token`), while `docs/auth-implementation-plan.md` specifies a generic refresh failure. This is intentionally outside the Phase 1 refresh-hardening scope, but the documentation and implementation do not fully agree.

## D. Medium/low-priority issues

- Unsupported verification types return `null` from `findUserByIdentifier()` instead of raising a bad-request error. DTO validation normally prevents this, so the impact is limited to direct service callers.
- `updatedAt` is explicitly changed during successful OTP verification to acquire a user-row lock. This is functional but makes `updatedAt` represent authentication activity rather than only ordinary user data changes.
- OTP delivery occurs after the database transaction. Delivery failure leaves a valid stored OTP that may never reach the user.
- No resend throttling or per-identifier/IP rate limiting exists yet.

## E. Security issues

- Same-OTP concurrent verification is correctly protected by the conditional `usedAt: null` update; only one request can consume the row and create a session.
- OTPs are hashed, single-use, expire after five minutes, and attempts are limited.
- Attempt-limit handling now consumes the OTP, which is good.
- Unknown identifiers, invalid codes, expired codes, used codes, and status failures use the same generic unauthorized message.
- Refresh-token hashes are stored instead of raw tokens.
- Refresh-token hash comparison also uses ordinary string equality. This is a Phase 2 issue, but it remains a timing-side-channel concern.
- No JWT guard or database session lookup is present, consistent with the approved Phase 1 scope.

## F. Test-quality issues

Current tests pass:

```text
6 test files passed
41 tests passed
```

The tests do prove:

- New email and phone authentication
- Existing-user authentication
- Session creation and refresh-token hashing
- JWT `sub` and `sid`
- Suspended/deleted rejection
- Generic OTP failures
- One-time OTP use
- Concurrent verification producing one session
- Basic normalization behavior

Missing or insufficient coverage:

- Concurrent OTP requests producing multiple active codes
- Deterministic behavior when multiple active codes exist
- HTTP-level `202` request response
- HTTP-level generic `401` response bodies/statuses
- DTO rejection of malformed email/phone inputs
- Concurrent status changes during verification
- Delivery failure behavior
- Timing-safe comparison behavior cannot be directly tested, but implementation should be reviewed.

## G. Unnecessary/out-of-scope changes

- Moving `OtpController` registration from `OtpModule` to `AuthModule` is justified because verification now composes `OtpService` and `AuthService`.
- Shared identifier normalization is within scope.
- Requiring a leading `+` for identity phone DTOs changes existing API behavior. This may be justified by an E.164 policy, but it is a breaking change and should be explicitly documented.
- The documentation files are not source-code changes, but both remain untracked in the working tree.

## H. Exact recommended fixes

1. Serialize OTP request handling per `(user/identifier, type)` or use a serializable transaction with retry so invalidation and creation cannot produce multiple active OTPs.
2. Add a deterministic tie-breaker to OTP selection, such as `createdAt DESC, id DESC`, while fixing request serialization.
3. Replace direct hash string comparisons with constant-time comparison.
4. Explicitly define phone input as strict E.164, or implement actual canonicalization and use it consistently in all paths.
5. Add HTTP/e2e tests for request status, generic verification errors, malformed identifiers, and concurrent OTP requests.
6. Align the implementation-plan wording around refresh error genericity with the intentionally unchanged Phase 1 refresh behavior.

## I. Whether Phase 1 is safe to commit

No. The same-OTP verification race is handled correctly, but concurrent OTP requests can violate the one-active-OTP assumption, and timing-safe comparison requirements are not met.

## J. READY FOR COMMIT

Not ready for commit.
