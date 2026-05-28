# Security Policy

Cantus is a local-first desktop app. Source code and history stay on your machine; the only data that leaves the device is the Claude Agent SDK's own model API calls.

## Supported versions

Cantus is pre-1.0 and under active development. Security fixes target the latest `main`.

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report privately via [GitHub Security Advisories](https://github.com/manan45/Cantus/security/advisories/new) or email **mananwadhwa4@gmail.com**. Include:

- A description of the issue and its impact.
- Steps to reproduce.
- Affected version / commit.

You can expect an acknowledgement within a few days. Please allow reasonable time for a fix before any public disclosure.

## Scope of interest

- Anything that could exfiltrate local source code or credentials off the device.
- Escaping the agent's scoped read/write access to the open project directory.
- IPC commands that perform privileged operations without proper validation.
