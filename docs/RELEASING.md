# Releasing prisma-prefixed-ids

How to publish a new version to npm. Pushing a version tag (`v*`) runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which builds, tests and **stages** the package on npm and creates a GitHub release. The version does not go live until a maintainer approves it with 2FA.

There is no npm token to create or rotate. The workflow authenticates to npm through GitHub OIDC as a *trusted publisher*.

## One-time setup

1. On [npmjs.com](https://www.npmjs.com), open the `prisma-prefixed-ids` package → **Settings** → **Trusted Publisher** → **GitHub Actions**.
2. Fill in:

   | Field | Value |
   |---|---|
   | Organization or user | `pureartisan` |
   | Repository | `prisma-prefixed-ids` |
   | Workflow filename | `release.yml` (exact, including the extension) |
   | Environment name | leave blank (the workflow does not use a GitHub environment) |
   | Allow `npm publish` | **unticked**. Staging is always allowed; direct publishing is not. |
   | Allow `npm dist-tag` | unticked |

3. Save. npm does not check the configuration when you save it. A mistake only shows up when a release runs, as `ENEEDAUTH`.

A new trusted publisher that has not completed a successful publish within **2 days** expires and has to be deleted and created again.

Requirements the workflow already meets: Node 22.14 or newer, npm 11.15.0 or newer (the workflow updates npm), `permissions: id-token: write`, a GitHub-hosted runner, a public repo, and a `repository.url` in `package.json` that matches this repo.

## Releasing a version

Changes reach `main` through PRs, so the version bump goes through one too, and the tag is pushed after it merges.

1. Branch from an up-to-date `main` and bump the version without tagging:

   ```bash
   git checkout main && git pull
   git checkout -b release/X.Y.Z
   npm version patch --no-git-tag-version      # or minor / major
   ```

2. Commit, push and open a PR. Merge it.
3. Tag the merged commit on `main` and push the tag:

   ```bash
   git checkout main && git pull
   npm test                       # same check the workflow runs
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

4. Watch the run, then approve the staged version (next section).

   ```bash
   gh run list -R pureartisan/prisma-prefixed-ids --workflow Release --limit 3
   gh run watch -R pureartisan/prisma-prefixed-ids
   ```

Version numbers on npm can never be reused. If a published version is bad, ship a fixed one and run `npm deprecate prisma-prefixed-ids@<bad> "use <fixed>"`.

## Dependency updates and automatic releases

[`.github/dependabot.yml`](../.github/dependabot.yml) opens a weekly PR for npm dependencies and one for GitHub Actions. Minor and patch bumps are grouped, and runtime dependencies are kept apart from dev dependencies. 
The `automerge-dependabot` job in [`ci.yml`](../.github/workflows/ci.yml) squash-merges a Dependabot PR once every test job has passed, unless it contains a **major** bump. Major bumps stay open for a person to review.

### Daily auto release (schedule off by default)

Merging a dependency update does not release anything by itself. [`auto-release.yml`](../.github/workflows/auto-release.yml) runs once a day (07:00 UTC) and cuts **one** patch release if Dependabot updates to **runtime** dependencies (`dependencies` in `package.json`) were merged since the last release tag. A day of updates is therefore one version, not one per merge. It finds them by their `chore(deps):` commit titles, which `dependabot.yml` sets. Dev dependency (`chore(deps-dev):`) and GitHub Actions (`ci:`) updates never trigger it.

The daily schedule is off until you turn it on:

```bash
gh variable set AUTO_RELEASE --body true -R pureartisan/prisma-prefixed-ids
gh variable delete AUTO_RELEASE -R pureartisan/prisma-prefixed-ids     # off again
```

Run it by hand any time, whatever the variable says (Actions tab → **Auto release** → **Run workflow**, or the command below). It releases only if there are runtime dependency updates waiting; tick **force** (`-f force=true`) to release anyway when there is at least one new commit since the last tag.

```bash
gh workflow run auto-release.yml -R pureartisan/prisma-prefixed-ids
gh workflow run auto-release.yml -R pureartisan/prisma-prefixed-ids -f force=true
```

When it releases, it bumps the patch version, commits `chore: release X.Y.Z` to `main`, pushes the tag and starts `release.yml` on it. The run summary lists the updates that were found, or says why nothing was released.

This does not publish to the public registry on its own. `release.yml` still only **stages** the version on npm, and you approve it with 2FA as described below. Reject a staged version you do not want.

It pushes straight to `main`, which only works while `main` has no branch protection or ruleset that blocks the GitHub Actions bot. GitHub also pauses scheduled workflows after 60 days without repository activity; a manual run or any push re-enables them.

## What the workflow does

1. Checks out the tagged commit, updates npm to 11.x and runs `npm ci` (which also builds, through the `prepare` script).
2. Fails if the tag does not equal `v` + the `package.json` version.
3. Runs `npm test` (unit tests plus the SQLite integration tests).
4. Runs `npm stage publish --provenance --access public`. This uploads the package to npm's staging area. It is **not** public yet.
5. Creates a GitHub release with generated notes. This happens when the version is staged, before you approve it on npm.

The MySQL and PostgreSQL integration tests and the Prisma 6 matrix run in [`ci.yml`](../.github/workflows/ci.yml) on every PR and push to `main`, not in the release workflow.

## Approve the staged version

Approving needs 2FA and cannot run in CI.

- **Website:** open the package on npmjs.com → **Staged Packages** → review the version → **Approve**.
- **CLI:**

  ```bash
  npm stage list prisma-prefixed-ids
  npm stage view <stage-id>
  npm stage approve <stage-id>
  ```

To discard a staged version instead, use **Reject** on the website or `npm stage reject <stage-id>`. A rejected version number can be staged again.

Until a version is approved, `npm view prisma-prefixed-ids version` shows the previous one.

## Verify a release

Run these from a different folder than the repo, so you test the published package and not your local build.

```bash
cd "$(mktemp -d)"
npm view prisma-prefixed-ids version
npm view prisma-prefixed-ids dist.tarball
```

Also check by eye:

- The package page at `https://www.npmjs.com/package/prisma-prefixed-ids` shows the new version and a **Provenance** badge.
- The GitHub **Releases** page has a release for the tag.

### Dry run before tagging

See exactly what would be published without publishing anything:

```bash
npm pack --dry-run
```

The tarball should contain `dist/`, `README.md`, `LICENSE` and `package.json`, and nothing else (no `src/`, no `tests/`, no `node_modules`).

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Workflow did not start | The tag must start with `v` and be pushed (`git push origin vX.Y.Z`). The workflow file must already be on `main`. |
| "Tag … does not match package.json version" | Tag and `package.json` disagree. If nothing was published, delete the tag and redo it (below). |
| `ENEEDAUTH` or `401` / `403` on stage | The trusted publisher is missing, expired (2 days with no successful publish), or does not match. Check owner, repo, workflow filename `release.yml`, an empty environment name, and that `repository.url` in `package.json` is this repo. |
| `403 … cannot publish over the previously published versions` | That version already exists on npm. Bump the version and tag again. |
| `npm stage` is not a command | npm is older than 11.15.0. The workflow updates npm; check that step ran. |
| Provenance error | The repo must be public, the runner GitHub-hosted, and the workflow must keep `id-token: write`. |
| Run succeeded but `npm view` shows the old version | The version is staged and waiting for approval. See "Approve the staged version". |
| Auto release fails to push to `main` | Branch protection blocks the GitHub Actions bot. Allow it to bypass, or release manually. |

Re-do a tag that **failed before staging** (safe because nothing reached npm):

```bash
git push origin :refs/tags/vX.Y.Z   # delete the remote tag
git tag -d vX.Y.Z                   # delete the local tag
# fix the problem, merge to main, then:
git tag vX.Y.Z && git push origin vX.Y.Z
```

Never do this for a version that already shows on npm. If the version was staged and you reject it, delete the GitHub release for that tag too (`gh release delete vX.Y.Z`).
