# Runner Platform Specification

## Status
DRAFT — requires product approval before implementation.

## 1. Purpose

Runner Platform is the operational business domain for Makook runners.

It enables qualified runners to discover available missions, accept missions, execute them, and track their earnings.

## 2. Runner Role

A Runner is an authenticated Makook user authorized to perform missions.

Runner authorization must be independent from ordinary Customer access.

## 3. Confirmed MVP Capabilities

The Runner App must support:

- View available errands
- Accept errands
- Navigate during mission execution
- Execute shopping workflow
- Upload receipts
- View earnings dashboard

## 4. Relationship With Mission Management

Runner Platform operates on top of Mission Management.

Core relationship:

Customer
   ↓
Mission
   ↓
Runner
   ↓
Execution
   ↓
Completion
   ↓
Earnings

Mission Management remains the source of truth for:

- Mission identity
- Customer ownership
- Runner assignment
- Mission status
- Mission lifecycle

Runner Platform must not create a duplicate mission lifecycle.

## 5. Runner Eligibility

A user must satisfy all of the following before acting as a Runner:

- authenticated
- active
- assigned the RUNNER role
- permitted to perform the requested runner operation

The exact onboarding/approval process is not yet specified.

## 6. Runner Mission Workflow

Approved conceptual flow:

OPEN mission
    ↓
Runner discovers mission
    ↓
Runner accepts mission
    ↓
Mission becomes ACCEPTED
    ↓
Runner starts execution
    ↓
Mission becomes IN_PROGRESS
    ↓
Runner performs required work
    ↓
Runner completes mission
    ↓
Mission becomes COMPLETED

Runner actions must respect Mission state transitions.

## 7. Navigation

Navigation is a confirmed Runner capability.

The navigation engine itself is NOT part of the first Runner backend implementation.

The Runner Platform should expose mission location data through an integration boundary when the location model is approved.

No mapping provider or routing logic should be hardcoded into Runner domain logic.

## 8. Shopping Workflow

Shopping is a confirmed Runner capability.

The detailed workflow is NOT yet specified.

Potential concepts requiring future approval:

- shopping items
- quantities
- substitutions
- item availability
- purchased quantities
- prices
- customer approval
- partial completion
- out-of-stock handling

These must not be implemented until explicitly approved.

## 9. Receipt Handling

Receipt upload is a confirmed capability.

The following are not yet approved:

- storage provider
- maximum file size
- allowed file types
- OCR processing
- receipt ownership rules
- receipt verification
- multiple receipt support
- receipt retention policy

Receipt storage must therefore be implemented later as a dedicated boundary.

## 10. Earnings

An Earnings Dashboard is a confirmed Runner capability.

The first Runner implementation must NOT invent a financial calculation model.

The following require separate Payment/Earnings specification:

- base earning
- distance component
- time component
- bonuses
- penalties
- tips
- refunds
- adjustments
- payout status
- payout schedule
- currency
- transaction history

Payments remain a separate Phase-2 module.

## 11. Runner Availability

Runner availability is not yet specified.

Future rules must define:

- online/offline state
- availability schedule
- geographic availability
- simultaneous mission limits
- temporary suspension
- operational blocking

No availability engine should be invented in the first implementation.

## 12. Runner Profile

A Runner profile is expected but not yet fully specified.

Potential future data:

- identity information
- verification state
- profile status
- documents
- vehicle information
- service area
- performance metrics

These require a dedicated Runner Identity/Onboarding specification.

## 13. Operations Integration

Operations must eventually be able to:

- monitor runner activity
- intervene in missions
- reassign missions
- review incidents
- monitor operational performance

Operations functionality should remain separated from the Runner domain.

## 14. Security Requirements

Every Runner operation must enforce:

- authentication
- RUNNER authorization
- mission assignment checks
- customer/runner ownership boundaries
- valid mission state transitions
- IDOR protection
- protection against acting on another runner's mission
- protection against unauthorized earnings access

## 15. Chat Integration

Chat is a separate Phase-2 module.

Runner Platform must expose a stable Mission integration point for future:

Customer
    ↕
Chat
    ↕
Runner

Chat implementation is explicitly outside the first Runner Platform implementation.

## 16. Non-Goals

The first Runner Platform implementation must NOT invent:

- payment processing
- payout processing
- AI dispatch
- advanced navigation
- chat
- OCR
- dynamic pricing
- runner onboarding workflow
- complex availability engine
- performance scoring

## 17. API Areas

Expected future API areas:

- available missions
- accept mission
- active mission
- start mission
- complete mission
- runner mission history
- receipt integration
- earnings integration

Exact routes and payloads require architecture approval.

## 18. Data Model Boundary

Runner Platform will initially rely on:

- User
- Role
- Permission
- Session
- Mission

New Runner-specific database entities should only be created when a confirmed business requirement requires them.

## 19. Approval Gate

Before implementation, Product/Architecture must approve:

- Runner eligibility
- Runner onboarding boundary
- Runner availability
- Mission interaction rules
- Navigation integration boundary
- Shopping workflow
- Receipt storage boundary
- Earnings boundary
- Runner history
- Operations interaction

## 20. Source of This Specification

This document separates confirmed Runner capabilities from undefined future business rules.

Anything not explicitly approved must remain outside the first implementation.
