# Security Policy

## Supported Versions

Only the current major release line receives security fixes.

| Version | Supported |
|---------|-----------|
| 2.x     | ✅        |
| < 2.0   | ❌        |

## Reporting a Vulnerability

Please **do not open a public issue** for an undisclosed vulnerability.

Report it privately using either:

- GitHub's [private vulnerability reporting](https://github.com/pureartisan/prisma-prefixed-ids/security/advisories/new)
- Email: prageeth@codemode.com.au

Include the affected version, a description of the issue, and steps to reproduce.
You can expect an acknowledgement within a few days. If the issue is confirmed, a fix
will be released on the supported line and the reporter credited unless they ask otherwise.

## Automated Scanning

- `npm audit` (moderate and above) on every push, pull request, and weekly
- CI installs for the audit job use `--ignore-scripts`
