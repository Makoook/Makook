# 1. Verdict

REJECT

The hardened OTP verification path is atomic and concurrency-safe for application-managed verification, but the implementation still has a consistency gap: direct `OtpService` request/lookup calls do not enforce the same E.164 validation enforced by the identity service and DTOs. The implementation-plan document also contains stale wording about the old phone policy.

# 2. Critical issues

No critical OTP-verification race was found.

The following verified properties are correct:

- OTP consumption is protected by a transaction-scoped advisory lock.
- Successful consumption uses a conditional `usedAt: null` update.
- Session creation occurs through the verification transaction callback.
- Concurrent verification of the same OTP can produce at most one successful session.

# 3. High-priority issues

- Phone validation is not fully consistent at the service boundary. `IdentityService.createUser()` validates E.164 input, and the HTTP DTOs validate it, but `OtpService.requestOtp()` and `OtpService.findUserByIdentifier()` only call `normalizePhone()` (trim). Direct service callers can therefore request or look up non-E.164 phone values that the identity path rejects.
- OTP request serialization is safe for the application paths that use `requestOtp()`, `createCode()`, and `verifyCode()`, but there is no schema-level partial unique index enforcing one active OTP if another writer bypasses these services.

# 4. Security review

- OTP hashes are compared with `timingSafeEqual` after hex decoding and length checking.
- Refresh-token hashes are also compared with `timingSafeEqual`.
- OTPs remain six digits, hashed, five-minute expiring, attempt-limited, and single-use.
- The fifth failed attempt consumes/locks the OTP.
- Unknown identifiers, wrong/expired/used/attempt-limited OTPs, and suspended/deleted users result in the same generic unauthorized error from the authentication path.
- Suspended and deleted users cannot obtain sessions.
- Refresh tokens are generated randomly and only their SHA-256 hashes are stored.
- Access JWTs retain `sub = userId`, `sid = sessionId`, and the configured 15-minute lifetime.
- No JWT guard, session lookup on access-token requests, session-family support, refresh replay detection, or refresh concurrency hardening was introduced, consistent with Phase 1 scope.

# 5. Concurrency review

The advisory lock is transaction-scoped through PostgreSQL `pg_advisory_xact_lock(hashtextextended(...))` and is keyed by `userId:type`.

It is used consistently in:

- `requestOtp()` before invalidating and creating OTP records.
- `createCode()` before invalidating and creating OTP records.
- `verifyCode()` before selecting and consuming an OTP.

This serializes application-managed OTP operations for the same user and type. OTP selection is deterministic with `createdAt DESC, id DESC`.

Concurrent verification is correctly single-winner: the transaction that marks `usedAt` succeeds and creates the session; the competing transaction observes a failed conditional update and returns the generic failure.

Remaining concurrency limitations:

- Advisory locks are not a persistent database invariant against arbitrary SQL or future writers that do not use the helper.
- OTP delivery occurs after the transaction. Concurrent requests can cause an earlier code to be delivered after a later request has invalidated it, producing a confusing client experience even though only one active row remains.

# 6. Authentication/session review

- New identifiers are created as provisional `ACTIVE` users and receive OTPs.
- Existing active users receive replacement OTPs.
- Suspended/deleted users do not receive usable OTPs and cannot authenticate.
- Successful verification updates only the relevant verification timestamp and leaves an existing timestamp unchanged.
- Every successful OTP authentication creates a new session.
- Session creation preserves optional `deviceId` and stores only the refresh-token hash.
- JWT generation uses the correct user and session identifiers.
- Existing `/auth/refresh` behavior remains functionally intact; only the refresh-token comparison implementation changed to constant-time comparison.

# 7. Normalization review

Email normalization is consistent:

- Trim whitespace.
- Lowercase.
- Apply the same normalizer in identity creation, OTP request, OTP lookup, and OTP verification.

Phone policy is explicitly documented as strict E.164 input with whitespace trimming only. HTTP DTOs and `IdentityService` enforce this policy.

The remaining inconsistency is that `OtpService` public methods do not themselves reject non-E.164 phone values. The API endpoints are protected by DTO validation, but service-level behavior is not identical everywhere.

# 8. Test-quality review

Current test run:

```text
Test Files  7 passed (7)
Tests       44 passed (44)
```

Tests do cover:

- New email and phone authentication.
- Existing-user authentication.
- Session creation and refresh-token hashing.
- JWT `sub` and `sid` claims.
- Suspended/deleted rejection.
- Generic OTP failure behavior.
- OTP one-time use and attempt limits.
- Concurrent verification producing one session.
- Concurrent OTP requests leaving one active OTP.
- Shared email/phone normalization utility behavior.

Test limitations:

- Concurrent request coverage uses the service method and proves active-row count, but does not inspect the delivered code or assert deterministic newest-code behavior.
- There are no HTTP-level tests proving `202` request responses or generic `401` response bodies.
- Phone DTO validation and identity endpoint validation are not tested end-to-end.
- Timing-safe comparison is implemented correctly, but tests only prove valid/invalid behavior, not the comparison primitive itself.
- Test cleanup uses shared database state and generated timestamps; this is acceptable for the current suite but is less isolated than per-test fixtures.

# 9. Scope review

The following source changes are necessary for Phase 1 or its approved hardening:

- Auth service/module changes for OTP authentication and session creation.
- OTP service/controller/module/DTO changes for OTP authentication, locking, and validation.
- Identity service/DTO changes for shared normalization and E.164 enforcement.
- `identifier-normalizer.ts` and its test.

No Prisma schema, guard, device, production-delivery, session-family, or cleanup-job changes were found.

Documentation artifacts currently in the working tree are outside runtime Phase 1 code:

- `docs/phase-1-auth-report.md`
- `docs/phase-1-code-review.md`
- `docs/phase-1-hardening-report.md`
- This requested `docs/phase-1-final-review.md`

They do not represent accidental source changes, but they should be handled separately from an implementation commit if documentation artifacts are not intended to ship with the code.

# 10. Documentation review

`docs/auth-implementation-plan.md` was modified to document the strict E.164 phone policy, which is relevant to the approved hardening work.

However, the document still contains stale wording under the phone section stating that the current implementation accepts an optional `+` and that the old behavior “must be replaced.” The current implementation already requires E.164 input at the DTO/service validation boundary. That paragraph should be rewritten for accuracy before final documentation approval.

The plan also describes future refresh concurrency/session-family work that was intentionally not implemented in Phase 1; this is clearly presented as planned architecture, not an accidental Phase 1 source change.

# 11. Tests and exact results

Command:

```text
pnpm --filter api test
```

Result:

```text
Test Files  7 passed (7)
Tests       44 passed (44)
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

No commit or push was performed.

# 14. Git diff --stat

```text
12 files changed, 769 insertions(+), 506 deletions(-)
```

This statistic excludes all untracked files.

# 15. Exact recommended fixes, if any

1. Enforce E.164 validation inside `OtpService.requestOtp()` and `findUserByIdentifier()`, not only in DTOs and `IdentityService`.
2. Add a test that calls identity creation, OTP request, and OTP verification through their HTTP boundaries with both accepted and rejected phone forms.
3. Update the stale phone-policy paragraph in `docs/auth-implementation-plan.md`.
4. Keep the advisory-lock helper mandatory for every OTP writer; if future non-service writers are introduced, consider a partial unique index on active OTP rows.
5. Add an HTTP-level concurrency/request test that verifies the delivered development code corresponds to the final active OTP.

# 16. Commit readiness

NOT READY FOR COMMIT
