# Packages Used

This document lists the packages currently used by the CodeFlow backend and
explains the role of each package.

## Backend packages

### Express

- **Package:** `express`
- **Version:** `^5.3.0`
- **Purpose:** Web framework for the planned HTTP API. It is installed but not
  used by any code yet (`docs/api.md` is still empty).

### Acorn

- **Package:** `acorn`
- **Version:** `^8.19.0`
- **Purpose:** Parses JavaScript source code into an Abstract Syntax Tree
  (AST). It is used by the `Parser` class in `backend/parser/Parser.js`.

## Package management

The backend uses npm for package management. The dependency versions are
declared in [`backend/package.json`](../backend/package.json), and the exact
resolved versions are recorded in
[`backend/package-lock.json`](../backend/package-lock.json).

> This document will be updated when more packages are added.
