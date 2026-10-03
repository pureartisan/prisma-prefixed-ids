# Contributing

Contributions are welcome: bug reports, fixes, docs and features.

## Reporting bugs and asking questions

Open an [issue](https://github.com/pureartisan/prisma-prefixed-ids/issues) with your Prisma version, database, a minimal schema and the query that misbehaves. For general questions, use GitHub Discussions or an issue.

**Security vulnerabilities:** do not open a public issue. See [SECURITY.md](./SECURITY.md).

## Making a change

1. Fork the repo and branch from `main`.
2. `npm ci`, then see [DEVELOPMENT.md](./DEVELOPMENT.md) for running tests.
3. Add or update tests for your change. Bug fixes should include a regression test.
4. Make sure `npm run format:check`, `npm run lint`, `npm run build` and `npm test` pass.
5. Open a pull request against `main` describing what and why. CI must pass before merge.

By contributing you agree your work is released under the [MIT License](./LICENSE).
