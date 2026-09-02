# Runner Platform API Contract

**Status:** DRAFT  
**Phase:** Phase 2 - Core Platform  
**Source of Truth:** Mission Management

## 1. Purpose

Runner Platform provides the authenticated runner-facing API for discovering available missions and executing the approved mission lifecycle.

Mission remains the source of truth for mission identity, ownership, assignment, status, and lifecycle.

Runner Platform must not create a second mission lifecycle or duplicate mission state.

## 2. MVP Scope

### Included

- View available missions
- Accept an available mission
- Start an accepted mission
- Complete an in-progress mission
- Read missions assigned to the authenticated runner
- Enforce runner authorization through permissions
- Preserve atomic first-accept behavior

### Deferred

The following are intentionally outside this MVP contract:

- Runner onboarding workflow
- Runner availability persistence
- Navigation persistence
- Shopping workflow persistence
- Receipt storage
- Earnings and payout APIs
- Chat APIs
- Payment APIs
- Runner performance analytics

These require their own approved specifications before implementation.

## 3. Authentication

All Runner Platform endpoints require:

- Valid JWT authentication
- Active user/session
- Appropriate Runner permission

Authorization must be evaluated server-side.

A client must never be able to assign itself a runner role or bypass permission checks.

## 4. Runner Permissions

| Capability | Permission |
|---|---|
| View available missions | `mission:read:available` |
| Accept mission | `mission:accept` |
| Start mission | `mission:start` |
| Complete mission | `mission:complete` |

Operations/Admin capabilities remain separate:

| Capability | Permission |
|---|---|
| Read any mission | `mission:read:any` |
| Reassign mission | `mission:reassign` |

## 5. Mission Lifecycle

Runner-facing lifecycle:

`OPEN → ACCEPTED → IN_PROGRESS → COMPLETED`

The following transitions are server-controlled:

- Accept: `OPEN → ACCEPTED`
- Start: `ACCEPTED → IN_PROGRESS`
- Complete: `IN_PROGRESS → COMPLETED`

Invalid transitions must return an appropriate client error and must not modify mission state.

Completed and cancelled missions are immutable through Runner Platform operations.

## 6. API Contract

### GET /missions/available

Returns missions currently available for runner acceptance.

**Auth:** JWT + `mission:read:available`

Expected behavior:

- Only open missions are returned.
- Cancelled/completed/in-progress missions are excluded.
- No customer private data beyond the approved response fields.
- Result ordering is deterministic.

### POST /missions/:id/accept

Accepts an available mission.

**Auth:** JWT + `mission:accept`

Rules:

- Authenticated user must have runner authorization.
- Mission must be `OPEN`.
- First valid acceptance wins.
- Concurrent acceptance attempts must not result in multiple runners.
- On success, mission becomes `ACCEPTED` and `runnerId` becomes the authenticated runner.

### POST /missions/:id/start

Starts a mission already assigned to the authenticated runner.

**Auth:** JWT + `mission:start`

Rules:

- Mission must be `ACCEPTED`.
- `runnerId` must equal authenticated user ID.
- Mission becomes `IN_PROGRESS`.

### POST /missions/:id/complete

Completes a mission already being executed by the authenticated runner.

**Auth:** JWT + `mission:complete`

Rules:

- Mission must be `IN_PROGRESS`.
- `runnerId` must equal authenticated user ID.
- Mission becomes `COMPLETED`.

## 7. Runner Mission Visibility

Runner access must follow ownership/assignment rules.

A runner may operate only on:

- missions successfully assigned to that runner, or
- missions explicitly exposed as available for acceptance.

A runner must not gain access to another runner's assigned mission by changing an ID in the URL.

## 8. Error Expectations

The API must distinguish at minimum:

- Unauthenticated request
- Missing permission
- Mission not found
- Invalid mission state
- Mission assigned to another runner
- Concurrent acceptance conflict

Responses must not leak internal database details, stack traces, tokens, or secrets.

## 9. Concurrency Requirement

Mission acceptance is a concurrency-sensitive operation.

The implementation must guarantee that two runners cannot both successfully accept the same mission.

The database transaction/update condition remains the authoritative mechanism.

## 10. Data Ownership

| Concern | Owner |
|---|---|
| Mission identity | Mission Management |
| Customer ownership | Mission Management |
| Runner assignment | Mission Management |
| Mission status | Mission Management |
| Financial data | Payments |
| Chat | Chat |
| Operational intervention | Operations |

Runner Platform consumes and mutates the Mission source of truth through controlled service operations.

## 11. Non-Goals

Runner Platform does not:

- create a duplicate Mission table
- maintain a second mission status
- own payment state
- own chat state
- bypass Mission authorization rules
- directly trust client-supplied runner IDs

## 12. Approval Gate

Before implementation expands beyond the current MVP, the following must be approved separately:

- Runner onboarding
- Availability model
- Navigation model
- Shopping execution model
- Receipt model
- Earnings/payment model
- Chat integration
- Runner analytics

