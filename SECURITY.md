# Security Policy

Cantus is a local-first desktop app. Source code and history stay on your machine; the only data that leaves the device is the `claude` CLI's own model API calls.

## Supported versions

Cantus is under active development and ships frequently. Security fixes land on the latest `main` and the most recent release; older releases are not separately patched.

| Version | Supported |
|---|---|
| 1.2.x (latest) | ✅ |
| < 1.2 | ❌ — upgrade to the latest release |

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report privately via [GitHub Security Advisories](https://github.com/manan45/Cantus/security/advisories/new) or email **mananwadhwa4@gmail.com**. Include:

- A description of the issue and its impact.
- Steps to reproduce.
- Affected version / commit.

You can expect an acknowledgement within a few days. Please allow reasonable time for a fix before any public disclosure.

## Scope of interest

- Anything that could exfiltrate local source code or credentials off the device.
- IPC commands that perform privileged filesystem, process, or git operations without proper validation.
- A path that lets the integrated terminal or task runner act outside the open project directory.
