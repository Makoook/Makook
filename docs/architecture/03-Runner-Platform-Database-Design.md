# Runner Platform Database Design

## Status

DRAFT — database contract before implementation.

## 1. Design Principle

Runner Platform must reuse the existing Mission and User domains.

No duplicate Mission entity is allowed.

No duplicate Mission status field is allowed.

No financial tables are introduced by Runner Platform MVP.

No Chat tables are introduced by Runner Platform MVP.

## 2. Existing Entities Used

### User

Represents the authenticated platform identity.

Runner eligibility is determined through:

- User status
- RUNNER role
- Runner permissions

### Role

Provides RUNNER authorization.

### Permission

Provides operation-level authorization.

### Mission

Remains the source of truth for:

- customer
- runner
- status
- lifecycle
- creation
- completion

### Session

Supports authenticated Runner access.

## 3. Mission Relationship

The existing Mission entity contains:

customerId
runnerId

Therefore:

One customer
    ↓
Many missions

One runner
    ↓
Many missions

A Mission may temporarily have:

runnerId = null

while it is OPEN.

Only one runner may occupy runnerId at any point in the active lifecycle.

## 4. Runner-Specific Persistence

For MVP:

NO new Runner table.

NO RunnerProfile table.

NO RunnerAvailability table.

NO RunnerVehicle table.

NO RunnerDocument table.

NO RunnerEarnings table.

These require explicit product specifications.

## 5. Mission Data Used by Runner Platform

Runner Platform consumes:

- id
- customerId
- runnerId
- status
- createdAt
- updatedAt

No additional Mission fields are introduced by Runner Platform MVP.

## 6. Required Indexes

Mission requires:

### Customer history

Index:

(customerId, createdAt)

Purpose:

efficient customer mission history.

### Runner active/history

Index:

(runnerId, status)

Purpose:

efficient retrieval of active and historical runner missions.

### Available missions

Index:

(status, createdAt)

Purpose:

efficient retrieval of OPEN missions ordered by creation time.

## 7. Assignment Consistency

Mission acceptance must remain atomic.

The logical acceptance predicate is:

status = OPEN
AND
runnerId IS NULL

A successful acceptance changes both:

runnerId
status

in one database operation.

## 8. State Transition Persistence

The database does not independently implement business state transitions.

Application service logic validates allowed transitions.

The database persists the resulting state.

Approved transitions:

DRAFT → OPEN

OPEN → ACCEPTED

ACCEPTED → IN_PROGRESS

IN_PROGRESS → COMPLETED

DRAFT → CANCELLED

OPEN → CANCELLED

ACCEPTED → CANCELLED

IN_PROGRESS → CANCELLED

## 9. Reassignment

Operations may change runnerId on an eligible Mission.

Reassignment must not be allowed for:

COMPLETED
CANCELLED

The reassignment operation must produce a valid resulting Mission state.

## 10. Referential Integrity

Mission.customerId:

- references User.id
- required
- on customer deletion follows existing User/Mission deletion policy

Mission.runnerId:

- references User.id
- nullable
- SET NULL when the referenced Runner is removed

This prevents a deleted Runner from leaving an invalid foreign-key reference.

## 11. Runner Role

The RUNNER role is stored in the existing Role table.

Runner permissions are stored in RolePermission.

Initial Runner permissions:

mission:read:available
mission:accept
mission:start
mission:complete

## 12. Operations Permissions

Operations/Admin permissions remain separate:

mission:read:any
mission:reassign

Runner permissions must not grant operations capabilities.

## 13. Future Extensions

The following can be added later without changing the Runner core boundary:

### Runner Profile

Separate profile data if approved.

### Availability

Separate runner availability model if approved.

### Documents

Separate verification/document model if approved.

### Earnings

Owned by Payments/Earnings.

### Receipts

Owned by dedicated receipt/storage boundary.

### Shopping

Owned by dedicated shopping workflow boundary.

## 14. Transaction Requirements

Mission acceptance must be atomic.

Any future operation that changes:

- runner assignment
- mission status

together must use a transactional/atomic persistence operation.

## 15. Database Security

Application authorization remains mandatory.

Database relationships alone do not provide authorization.

Every mission read/write must validate:

- authenticated identity
- ownership or assignment
- role
- permission
- valid state transition

## 16. Migration Policy

Runner Platform MVP must not modify existing tables unless required by an approved business requirement.

The current Mission model already provides the necessary Runner relationship.

Therefore:

Expected additional migration:
NONE

unless architecture implementation identifies a required constraint/index that is not already present.

## 17. Database Contract

The Runner Platform MVP database contract is:

User
 ├── UserRole
 │      └── Role = RUNNER
 │
 └── Mission
       ├── customerId
       ├── runnerId
       └── status

Mission remains the shared integration point.

## 18. Approval Gate

Before API implementation:

- Existing Mission schema reviewed
- Runner/User relationship reviewed
- Permission model reviewed
- Required indexes reviewed
- Assignment atomicity reviewed
- Referential integrity reviewed
- No unnecessary Runner-specific entities approved
- Payments boundary approved
- Chat boundary approved

