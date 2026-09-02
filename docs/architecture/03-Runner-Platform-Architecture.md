# Runner Platform Architecture

## Status

DRAFT — architecture decision for MVP implementation.

## 1. Architectural Goal

Runner Platform provides runner-facing capabilities without duplicating Mission Management responsibilities.

The Mission domain remains the source of truth for mission lifecycle and assignment.

Runner Platform provides the runner-facing operational boundary around that lifecycle.

## 2. Domain Boundaries

### Mission Management owns

- Mission identity
- Customer ownership
- Runner assignment
- Mission status
- Mission state transitions
- Mission history

### Runner Platform owns

- Runner-facing mission discovery
- Runner eligibility checks
- Runner-specific access control
- Runner mission views
- Runner execution entry points
- Runner mission history access

### Payments owns

- Financial calculations
- Earnings calculations
- Payment authorization
- Payment capture
- Payouts
- Refunds
- Financial transactions

### Chat owns

- Conversations
- Messages
- Participants
- Message delivery
- Message history

### Operations owns

- Operational monitoring
- Manual interventions
- Mission reassignment
- Incident operations

## 3. Dependency Direction

Customer
    |
    v
Mission Management
    |
    +----> Runner Platform
    |
    +----> Chat
    |
    +----> Payments

Operations
    |
    +----> Mission Management
    |
    +----> Runner Platform

Runner Platform must not become the owner of Mission lifecycle state.

## 4. Runner Authorization

Runner operations require:

1. Authentication
2. Active user status
3. RUNNER role
4. Required mission permission
5. Mission-specific ownership/assignment validation

Permission checks remain centralized through the existing authorization system.

## 5. Mission Interaction

Runner Platform consumes Mission Management operations for:

- available missions
- accepting a mission
- starting a mission
- completing a mission
- runner mission history

No second Mission table is permitted.

No duplicate mission status field is permitted outside Mission Management.

## 6. Concurrency

Mission acceptance must remain atomic.

The system must guarantee that two concurrent runners cannot both successfully acquire the same OPEN mission.

The authoritative write condition is:

mission.status = OPEN
AND
mission.runnerId IS NULL

Only one request may transition the mission to ACCEPTED successfully.

## 7. State Ownership

Mission status is owned exclusively by Mission Management.

Runner Platform may request valid transitions but must not directly invent or bypass lifecycle states.

Approved MVP lifecycle:

DRAFT
  ↓
OPEN
  ↓
ACCEPTED
  ↓
IN_PROGRESS
  ↓
COMPLETED

Cancellation:

DRAFT / OPEN / ACCEPTED / IN_PROGRESS
  ↓
CANCELLED

## 8. Runner Views

Runner-facing views should be derived from Mission Management.

### Available Missions

Only OPEN missions.

### Active Mission

The runner's assigned mission where status is:

- ACCEPTED
- IN_PROGRESS

### Mission History

Missions previously assigned to the runner.

Completed and cancelled missions may be included according to product requirements.

## 9. Runner Eligibility

For MVP, Runner eligibility is based on:

- authenticated User
- ACTIVE status
- RUNNER role
- required permissions

Complex onboarding, documents, vehicle verification, geographic eligibility, and availability are outside MVP.

## 10. Navigation Boundary

Navigation is an integration boundary.

Runner Platform exposes mission location data when the Mission location model is approved.

Routing and map-provider implementation must remain outside Runner business logic.

## 11. Shopping Boundary

Shopping workflow is a future extension.

Runner Platform should not introduce shopping-specific persistence until the shopping specification is approved.

## 12. Receipt Boundary

Receipt handling is a future extension.

Receipt storage, OCR, file validation, and retention remain outside the MVP Runner core.

## 13. Earnings Boundary

Runner Platform does not calculate earnings.

The future Payments/Earnings module will consume completed mission information and own financial calculations.

Runner Platform may expose a future integration contract for earnings without implementing financial logic.

## 14. Operations Boundary

Operations may:

- monitor runner activity
- intervene in missions
- reassign missions

Operations permissions must be separate from ordinary Runner permissions.

## 15. API Boundary

The initial Runner API should remain thin.

Expected operations:

GET    /runner/missions/available
GET    /runner/missions/active
GET    /runner/missions/history
POST   /missions/:id/accept
POST   /missions/:id/start
POST   /missions/:id/complete

Existing Mission endpoints remain authoritative.

Routes may be reorganized during final API design if that produces a cleaner domain boundary.

## 16. Database Boundary

MVP should avoid unnecessary Runner-specific tables.

Existing entities are sufficient:

- User
- Role
- Permission
- Mission
- Session

New entities require an approved business requirement.

## 17. Security

Every Runner endpoint must defend against:

- IDOR
- cross-runner access
- customer data exposure
- unauthorized mission transitions
- privilege escalation
- access by suspended/deleted users
- replayed requests
- concurrent acceptance races

## 18. Chat Integration

Chat remains independent.

Future relationship:

Mission 1 ---- Chat Conversation 1
        |
        +---- Customer
        |
        +---- Runner

Chat must not own Mission state.

## 19. Payments Integration

Payments remains independent.

Future relationship:

Mission
   |
   +---- completed mission data
             |
             v
        Payments/Earnings

Payments owns all money-related state.

## 20. Architectural Invariants

The following must always remain true:

1. One Mission entity is the source of truth.
2. One active runner per mission.
3. Mission state transitions are authoritative.
4. Runner authorization is enforced.
5. Financial logic is outside Runner Platform.
6. Chat logic is outside Runner Platform.
7. Navigation provider logic is outside Runner Platform.
8. Business rules are not duplicated between domains.
9. Concurrent mission acceptance is atomic.
10. No unapproved business entities are added.

## 21. Implementation Order

1. Mission database foundation
2. Mission lifecycle API
3. Runner authorization
4. Runner mission discovery
5. Runner active/history views
6. Security tests
7. Integration tests
8. Payment boundary
9. Chat boundary
10. Advanced runner features

## 22. Approval Gate

Before implementation, architecture approval requires:

- domain boundaries approved
- mission ownership approved
- Runner authorization approved
- concurrency model approved
- API boundary approved
- database boundary approved
- Payment boundary approved
- Chat boundary approved

