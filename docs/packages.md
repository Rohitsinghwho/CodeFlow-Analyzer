# Packages Used

This document lists the packages currently used by the CodeFlow backend and
explains the role of each package.

## Backend packages

### Express

- **Package:** `express`
- **Version:** `^5.3.0`
- **Purpose:** Provides the backend web framework. Express is used to define
  HTTP routes, handle requests and responses, and expose the CodeFlow
  functionality through an API.

### Acorn

- **Package:** `acorn`
- **Version:** `^8.19.0`
- **Purpose:** Parses JavaScript source code into an Abstract Syntax Tree
  (AST). The AST gives the application a structured representation of source
  files so it can identify functions and their relationships when building
  the call graph.

## Package management

The backend uses npm for package management. The dependency versions are
declared in [`backend/package.json`](../backend/package.json), and the exact
resolved versions are recorded in
[`backend/package-lock.json`](../backend/package-lock.json).

> This document will be updated when more packages are added.
