# Mission Management Specification

## Status
DRAFT — requires product approval before implementation.

## 1. Purpose

Mission Management is the core business domain of Makook.

Makook enables customers to delegate local errands to trusted runners.

A Mission represents a customer-requested local errand.

## 2. Core Actors

### Customer
Creates and owns the mission.

### Runner
Can accept an available mission and execute it.

### Operations
Monitors missions and may perform operational interventions.

## 3. Confirmed MVP Capabilities

Customer:
- Create an errand
- Track mission progress
- View mission history

Runner:
- View available errands
- Accept an errand
- Execute the errand
- Support shopping workflow
- Upload receipts

Operations:
- Monitor missions
- Intervene when operationally required

## 4. Confirmed Mission Lifecycle

The exact lifecycle states are NOT YET APPROVED.

The implementation must not invent final state names until product rules are approved.

Expected conceptual flow:

Customer creates mission
        ↓
Mission becomes available for dispatch
        ↓
Runner accepts mission
        ↓
Runner executes mission
        ↓
Mission is completed
        ↓
Mission appears in customer history

Cancellation, rejection, reassignment, incidents, and failure states require explicit business rules.

## 5. Data Requirements

The following concepts are confirmed:

- Customer ownership
- Runner assignment
- Mission status
- Mission creation
- Mission progress
- Mission completion
- Mission history

The following fields are NOT YET SPECIFIED:

- title
- description
- pickup location
- destination
- geographic coordinates
- scheduled time
- priority
- estimated cost
- final cost
- payment state
- cancellation reason
- assignment timestamps
- completion data
- receipt data
- attachments
- notes

These must not be implemented until approved.

## 6. Approved MVP Business Rules

1. Customer owns the mission.
2. Customer can create and publish its own mission.
3. Runner access requires Runner authorization.
4. First valid Runner acceptance wins.
5. State transitions are strictly enforced.
6. Completed missions are immutable from the MVP transition API.
7. Customer cannot access another customer's mission.
8. Runner cannot modify an unassigned mission.
9. Operations/Admin can monitor and reassign missions.
10. Chat is intentionally separate from Mission Management.

## 7. Future Business Rules



1. Can a customer edit a mission after creation?
2. When does a mission become available to runners?
3. How is a runner selected?
4. Can multiple runners compete for the same mission?
5. Can a runner reject an accepted mission?
6. Can operations reassign a mission?
7. Who can cancel a mission?
8. What happens when a runner abandons a mission?
9. What are the exact mission states?
10. Are missions immediately actionable or scheduled?
11. How are location requirements represented?
12. How is mission cost calculated?
13. When is payment authorized?
14. When is payment captured?
15. What constitutes successful completion?
16. What happens when the customer disputes completion?
17. How are receipts stored?
18. How are incidents represented?

## 8. API Scope

No production endpoints should be implemented until the lifecycle and business rules above are approved.

Expected API areas:

- Mission creation
- Mission retrieval
- Mission listing/history
- Mission status/progress
- Runner mission acceptance
- Runner mission execution
- Operations mission monitoring

Exact routes require API design approval.

## 9. Security Requirements

Every mission endpoint must enforce:

- authenticated access
- customer ownership checks
- runner assignment checks
- role/permission checks
- protection against IDOR
- protection against unauthorized state transitions
- auditability of important state changes

## 10. Non-Goals

The first implementation must NOT invent:

- AI dispatch
- dynamic pricing
- payment processing
- chat
- navigation
- advanced analytics
- notification orchestration

Those belong to later platform components unless explicitly added to the approved MVP.

## 11. Approval Gate

Before implementation, Product must approve:

- Mission lifecycle
- Mission data model
- Customer capabilities
- Runner capabilities
- Operations capabilities
- State-transition rules
- Cancellation rules
- Assignment rules
- Location model
- Pricing/payment boundary

## 12. Source of This Specification

This draft is intentionally limited to requirements explicitly present in the current Makook project documentation.

Anything not explicitly defined remains pending product decision.
