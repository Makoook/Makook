# 1. Verdict

APPROVE

The approved Phase 1 hardening issues are resolved. OTP request operations are serialized with PostgreSQL transaction-scoped advisory locks, service-level phone validation now matches the E.164 policy, timing-safe comparisons are used, and the required tests pass.

# 2. Files changed

Implementation files modified:

- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/otp/otp.controller.ts`
- `apps/api/src/auth/otp/otp.controller.spec.ts`
- `apps/api/src/auth/otp/otp.module.ts`
- `apps/api/src/auth/otp/otp.service.ts`
- `apps/api/src/auth/otp/otp.service.spec.ts`
- `apps/api/src/auth/otp/request-otp.dto.ts`
- `apps/api/src/auth/otp/verify-otp.dto.ts`
- `apps/api/src/identity/dto/create-user.dto.ts`
- `apps/api/src/identity/identity.service.ts`
- `docs/auth-implementation-plan.md`

Implementation file added:

- `apps/api/src/identity/identifier-normalizer.spec.ts`
- `apps/api/src/identity/identifier-normalizer.ts`

This review report is also added:

- `docs/phase-1-final-hardening-report.md`

# 3. Fixes implemented

- OTP request, OTP creation, and OTP verification now use a PostgreSQL transaction-scoped advisory lock keyed by `userId` and verification type.
- Concurrent application-managed OTP requests invalidate prior active codes and leave only one active OTP.
- OTP selection is deterministic: newest `createdAt` first, then newest `id`.
- OTP hash comparisons use `timingSafeEqual` after hex decoding and length checks.
- Refresh-token hash comparisons use `timingSafeEqual` without changing token generation or hashing algorithms.
- Phone policy is explicitly strict E.164: surrounding whitespace is trimmed, but non-E.164 values are rejected.
- `OtpService.requestOtp()` and `OtpService.findUserByIdentifier()` now enforce the same shared identifier validation used by identity and DTO boundaries.
- Added direct service-level tests for invalid phone values, valid E.164 values, whitespace handling, and IdentityService/OtpService consistency.
- Existing authentication, status protection, single-use OTP, attempt-limit, expiration, JWT claim, and concurrency behavior remains covered.

# 4. Security review

- OTP consumption remains transactional and conditional on unused, unexpired, under-limit, matching-code state.
- Session creation remains inside the successful OTP verification transaction callback.
- Concurrent verification of one OTP can produce at most one session.
- OTPs remain one-time use, five-minute expiring, and five-attempt limited.
- Wrong, expired, used, unknown, attempt-limited, suspended, and deleted authentication cases remain generic unauthorized failures.
- Suspended and deleted users cannot obtain authenticated sessions.
- Refresh-token hashes, not raw refresh tokens, are stored.
- OTP and refresh-token hash comparisons are timing-safe.
- Access JWTs retain `sub = userId`, `sid = sessionId`, and the configured 15-minute lifetime.
- No guards, session families, refresh replay handling, device integration, production delivery, or cleanup job was introduced.

# 5. Concurrency review

The advisory lock is acquired with `pg_advisory_xact_lock(hashtextextended(...))` and automatically released at transaction completion. The same `userId:type` key is used by `requestOtp()`, `createCode()`, and `verifyCode()`.

This serializes all application-managed OTP writers for the same user and type. The request transaction invalidates previous active records before creating the replacement. Verification uses the same lock plus a conditional `usedAt: null` update, so a concurrent verifier cannot create a second session.

No Prisma schema change or migration is required. A future partial unique index could provide additional protection for non-service database writers, but it is not necessary for the current application architecture.

# 6. Authentication/session review

- New identifiers still create provisional active users and receive OTPs.
- Existing active users still authenticate through OTP and receive a new session each time.
- Verification timestamps are set only when absent; existing timestamps are preserved.
- Session creation preserves `deviceId` and the existing 30-day lifetime.
- Access JWT creation continues to use the correct user and session IDs.
- Existing `/auth/refresh` behavior remains functionally unchanged except for timing-safe refresh-hash comparison.

# 7. Normalization review

Email behavior is consistent across identity creation, OTP request, lookup, and verification: trim and lowercase before validation/storage/lookup.

Phone behavior is now explicitly consistent across the service and HTTP boundaries:

- Input must already be strict E.164 with a leading `+`.
- Surrounding whitespace is trimmed.
- Non-E.164 values are rejected.
- The shared normalizer/validator is used by IdentityService and OtpService, while DTOs enforce the same policy at the API boundary.

# 8. Test-quality review

The tests cover the important Phase 1 properties:

- Concurrent OTP requests for one identifier/type leave exactly one active OTP.
- Concurrent verification of one OTP creates at most one session.
- Valid, wrong, expired, used, and attempt-limited OTP behavior.
- New and existing email/phone authentication.
- Suspended/deleted user rejection.
- Session creation, refresh-token hashing, and JWT `sub`/`sid` claims.
- Email normalization and strict E.164 phone policy.
- IdentityService and OtpService service-boundary consistency.

The concurrency tests run against the configured PostgreSQL test database rather than only mocks.

# 9. Scope review

All implementation source changes are within Phase 1 authentication or its approved hardening:

- Auth and OTP orchestration.
- OTP concurrency and one-time-use handling.
- Shared identity normalization/validation.
- Authentication/session tests.

No Prisma schema, migration, JWT guard, session family, refresh replay/concurrency hardening, Device integration, production provider, or provisional cleanup implementation was introduced.

The working tree also contains earlier documentation artifacts (`docs/phase-1-auth-report.md`, `docs/phase-1-code-review.md`, `docs/phase-1-hardening-report.md`, and `docs/phase-1-final-review.md`). These are outside runtime implementation but are pre-existing requested reports, not accidental source changes.

# 10. Documentation review

`docs/auth-implementation-plan.md` was modified only to remove the stale phone-policy wording and accurately document the current policy:

- Phone input must be E.164.
- Surrounding whitespace may be trimmed.
- The same policy is enforced by Identity and OTP service/API boundaries.

No unrelated plan section was rewritten.

# 11. Tests and exact results

Command:

```text
pnpm --filter api test
```

Result:

```text
Test Files  7 passed (7)
Tests       45 passed (45)
```

# 12. Build result

Command:

```text
pnpm --filter api run build
```

Result: passed successfully with `nest build`.

# 13. Git status

Modified tracked files:

- `apps/api/src/auth/auth.module.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/otp/otp.controller.spec.ts`
- `apps/api/src/auth/otp/otp.controller.ts`
- `apps/api/src/auth/otp/otp.module.ts`
- `apps/api/src/auth/otp/otp.service.spec.ts`
- `apps/api/src/auth/otp/otp.service.ts`
- `apps/api/src/auth/otp/request-otp.dto.ts`
- `apps/api/src/auth/otp/verify-otp.dto.ts`
- `apps/api/src/identity/dto/create-user.dto.ts`
- `apps/api/src/identity/identity.service.ts`

Untracked files:

- `apps/api/src/identity/identifier-normalizer.spec.ts`
- `apps/api/src/identity/identifier-normalizer.ts`
- `docs/auth-implementation-plan.md`
- `docs/phase-1-auth-report.md`
- `docs/phase-1-code-review.md`
- `docs/phase-1-hardening-report.md`
- `docs/phase-1-final-review.md`
- `docs/phase-1-final-hardening-report.md`

No commit or push was performed.

# 14. Git diff --stat

```text
12 files changed, 830 insertions(+), 509 deletions(-)
```

This statistic excludes untracked files.

# 15. Remaining issues

- Phase 2 refresh-token session-family, replay-detection, and concurrent-rotation hardening remains pending.
- JWT guards and protected-endpoint enforcement remain pending.
- Device integration, production OTP delivery, and the provisional-account cleanup job remain pending.
- Advisory locks protect application-managed writers; a partial unique index may be considered if direct database writers are introduced.

# 16. Commit readiness

READY FOR COMMIT
