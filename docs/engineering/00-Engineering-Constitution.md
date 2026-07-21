# Engineering Constitution

| Field | Value |
|-------|-------|
| Document | Engineering Constitution |
| Version | 1.0 |
| Status | Approved |
| Owner | Makook Team |

---

# Purpose

This document defines the engineering standards that every contributor to Makook must follow.

These rules apply to all source code, documentation, architecture, infrastructure, AI-generated code, and future services.

---

# Core Principles

## 1. Documentation First

No feature is implemented before its documentation is approved.

---

## 2. Simplicity

Prefer simple solutions over complex ones.

If two solutions solve the same problem, choose the simpler one.

---

## 3. Readability

Code is written for humans first.

Readable code is more important than clever code.

---

## 4. Scalability

Every major decision should consider future growth.

Avoid building temporary solutions that will become technical debt.

---

## 5. Security by Design

Security is part of the design process.

Never add it later.

---

## 6. AI-Assisted Development

Artificial Intelligence assists development.

AI never replaces engineering judgment.

Every AI-generated change must be reviewed.

---

# Architecture Rules

Makook follows:

- Clean Architecture
- Modular Design
- API First
- Domain Driven Thinking

---

# Source Control

Version Control:

Git

Platform:

GitHub

Branch Strategy:

- main
- develop
- feature/*
- hotfix/*

---

# Commit Convention

Use Conventional Commits.

Examples:

feat:
fix:
docs:
test:
refactor:
chore:

---

# Pull Requests

Every Pull Request should:

- Have a clear description.
- Reference related issues.
- Pass all tests.
- Be reviewed before merging.

---

# Documentation

Documentation is part of the product.

Code without documentation is incomplete.

---

# Naming

Use English for:

- Code
- APIs
- Database
- Variables
- Documents

---

# AI Policy

Makook officially uses AI during development.

Current AI stack:

- ChatGPT
- Claude Code
- Cursor
- Codex

Every generated code change must be understood before being merged.

---

# Decision Making

Major technical decisions must be documented.

No undocumented architectural changes are allowed.

---

# Quality

Before any feature is considered complete:

- Documentation
- Unit Tests
- Code Review

must all be completed.

---

# Final Principle

We build Makook for the next ten years, not for the next demo.