# 1. Files changed

Modified:

- `apps/api/src/auth/auth.service.ts`
- `apps/api/src/auth/auth.service.spec.ts`
- `apps/api/src/auth/otp/otp.service.ts`
- `apps/api/src/auth/otp/otp.service.spec.ts`
- `apps/api/src/identity/identity.service.ts`
- `docs/auth-implementation-plan.md`

Added:

- `apps/api/src/identity/identifier-normalizer.spec.ts`

# 2. Changes implemented

- Added PostgreSQL transaction-scoped advisory locking for OTP request, creation, and verification paths.
- Guaranteed only one active OTP per user and verification type for application-managed writes.
- Added deterministic OTP selection ordering: newest `createdAt`, then newest `id`.
- Replaced OTP hash comparison with `timingSafeEqual`.
- Replaced refresh-token hash comparison with `timingSafeEqual`.
- Made the phone policy explicit: callers must provide E.164 numbers; only surrounding whitespace is trimmed.
- Applied consistent phone/email validation to identity creation, OTP request, and OTP verification.
- Added concurrent OTP-request tests proving that only one active OTP remains.

# 3. Tests and exact results

Command:

```text
pnpm --filter api test
```

Result:

```text
Test Files  7 passed (7)
Tests       44 passed (44)
```

# 4. Build result

Command:

```text
pnpm --filter api run build
```

Result: passed successfully with `nest build`.

# 5. Git status

Modified tracked files include:

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

Untracked files currently include:

- `apps/api/src/identity/identifier-normalizer.spec.ts`
- `apps/api/src/identity/identifier-normalizer.ts`
- Existing documentation files under `docs/`

No commit or push was performed.

# 6. Git diff stat

```text
12 files changed, 769 insertions(+), 506 deletions(-)
```

This excludes untracked files.

# 7. Remaining issues

- Phase 2 refresh-token session-family, replay-detection, and concurrent-rotation hardening remain pending.
- JWT guards and protected-endpoint enforcement remain pending.
- Device integration, production OTP delivery, and provisional-account cleanup remain pending.
- Advisory locks protect application-managed writes; a partial unique database index could provide an additional defense if direct database writers are introduced later.

No Prisma schema or migration was required for this hardening work.
