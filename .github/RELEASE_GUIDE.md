# Release guide

Follow this guide to prepare and publish a Finance Manager release. A release is a reviewed release PR to `main` (changelog, version bump, README link) followed by a GitHub release tagged on the merged commit. Deploying the running app is a separate step and is not part of a release unless the user asks for it.

Use placeholders below: `X.Y` is the new version, `PREV` is the previous published tag (for example `v3.0`), and `<n>` is the release issue number.

## 1. Choose the version

- Versions are `vMAJOR.MINOR` tags (`v3.0`, `v3.1`). The root `package.json` stores the same value without `v` (`"version": "3.1"`); API `/version` and Settings read it through `APP_VERSION`. MCP protocol/worker versions are independent and are not bumped by a release.
- GitHub release titles use only the tag name, for example `v3.2`. Do not prefix them with the application name; use the same short version heading in release notes.
- Bump **MINOR** for normal feature and fix releases. Bump **MAJOR** only for a large redesign or an upgrade that needs deliberate user action (breaking API/MCP contract, retired features, non-trivial data migration). Use the version the user asks for; if none is given, propose one with a one-line reason before starting.
- Find the previous release with `gh release view --repo apptrackit/finance --json tagName,publishedAt` (latest published) and confirm it with `git fetch origin --tags`.

## 2. Issue and branch

Follow the issue-first workflow in `AGENTS.md`:

- Create (or reuse) a **Task** issue titled `Prepare vX.Y release` from `.github/ISSUE_TEMPLATE/task.md`, with the `documentation` label and Priority `Medium` unless the user says otherwise. Completion criteria should cover: every shipped change since `PREV` is in the changelog, versions agree, README/changelog/release notes agree, checks pass, and the release targets the merged release commit.
- Branch from freshly fetched `origin/main`: `task/<n>-vX-Y-release` (dots become dashes, e.g. `task/86-v3-1-release`).

## 3. Audit everything since the previous release

The `Unreleased` section is usually incomplete. Do not trust it; rebuild the picture from git and GitHub.

```bash
git fetch origin --tags
# Merged PRs and direct commits on main, in order
git log PREV..origin/main --first-parent --date=short --format='%h %ad %s'
# Every non-merge commit (catches fixes pushed directly to main)
git log PREV..origin/main --no-merges --format='%h %s'
# PR titles and bodies for context
gh pr list --repo apptrackit/finance --state merged --base main --search 'merged:>=<PREV publish date>' --limit 100 --json number,title,body,url
```

- Check every merged PR **and** every direct commit to `main` against `Unreleased`. Read the PR body or diff when a title is vague.
- Note new files in `api/migrations/` (`git diff --name-only PREV..origin/main -- api/migrations`); each one needs an upgrade note.
- Note anything that changes deployment, configuration, environment variables, MCP tools, exports, or requires the user to do something when upgrading.

## 4. Update `CHANGELOG.md`

The changelog is a **recap for a person upgrading**, not a commit log. Describe what was added or changed and why it matters; leave out implementation detail.

- **Group by feature, not by commit.** A feature built across ten commits or several PRs is one bullet with all its links. Small follow-up fixes to a feature that is new in this release are part of that feature, not separate "Fixed" entries.
- **Order by user impact.** Most important first within each section: financial correctness and data safety, then major features, then smaller UI changes, then maintenance.
- **Keep bullets short**: one to three sentences. Prefer what the user can now do or what behaves differently over how it was built.
- **Collapse maintenance.** Tests, CI, refactors, docs, and contributor workflow go in one or two bullets at the end of `Changed` (or a `Changed — maintenance` subsection), not one bullet per PR.
- **Link sources** at the end of each bullet: `[#78](https://github.com/apptrackit/finance/pull/78)`. Link the PR; link the issue only when there is no PR. Link a direct commit as `[short description](https://github.com/apptrackit/finance/commit/<sha>)`.
- Omit sections that would be empty.

Rename the `Unreleased` heading to the release and add a fresh empty `## Unreleased` above it. Use this structure:

```markdown
## Unreleased

## vX.Y — YYYY-MM-DD

[GitHub release](https://github.com/apptrackit/finance/releases/tag/vX.Y) · [Compare PREV…vX.Y](https://github.com/apptrackit/finance/compare/PREV...vX.Y)

### Highlights

- Two to four bullets: the headline changes of this release in plain language.

### Added

- New capability. [#123](https://github.com/apptrackit/finance/pull/123)

### Changed

- Changed behavior the user will notice. [#124](https://github.com/apptrackit/finance/pull/124)
- Maintenance: CI, tests, deployment tooling, and contributor workflow. [#125](…), [#126](…)
- Bumped the root application version to **X.Y**, used by the API version endpoint and Settings.

### Fixed

- Defect and its visible effect. [#127](https://github.com/apptrackit/finance/pull/127)

### Removed

- Retired feature and its replacement, if any.

### Migration and upgrade notes

- Apply these migrations in order before updating API/MCP Workers:
  - `0NN-name.sql`: what it adds or enforces.
- Any manual step, configuration change, or behavior an upgrader must know about.
```

Section names can carry a theme when that helps scanning (for example `### Fixed — financial correctness`), as in the v3.1 entry.

- `YYYY-MM-DD` is the **planned GitHub publication date in UTC**; step 9 verifies it.
- The GitHub release and compare links are known in advance because the tag name is fixed. Fill them in now so no post-release changelog commit is needed.
- Update the intro sentence at the top of the file that says which release the file covers through (`through **vX.Y**`).

## 5. Bump the version and README

- Set `"version": "X.Y"` in the root `package.json` and in **both** root entries of `package-lock.json` (top-level `version` and `packages[""].version`). Do not use `npm version`: `X.Y` is not valid semver. Confirm the lockfile diff contains only those two lines.
- In `README.md`, update the "latest published release" line to the new tag and changelog anchor. GitHub anchors drop dots and turn ` — ` into `--`: `## v3.1 — 2026-10-01` → `CHANGELOG.md#v31--2026-10-01`.

## 6. Verify

Run the full checks from `AGENTS.md` on the pinned Node 22 runtime:

```bash
npm test
npm run typecheck
VITE_API_KEY=ci-placeholder VITE_API_DOMAIN=localhost:8787 npm run build
npm run lint -w client -- --max-warnings=0
git diff --check
```

Also run the client suite on Node 26 when it is available, matching CI. Then confirm coverage: every PR number from `git log PREV..origin/main --first-parent` and every direct commit appears in the new changelog section (a short script that diffs the two sets is fine).

## 7. Release PR and draft release

- Commit (`Prepare vX.Y release`), push, and open a PR to `main` titled `Prepare vX.Y release`, using `.github/PULL_REQUEST_TEMPLATE.md` with `Closes #<n>` first. List the checks run and the coverage audit in Verification.
- Write the release notes to a temporary file: `# vX.Y`, a blank line, then the **exact body** of the changelog section (from the link line through the upgrade notes). The GitHub release and the changelog must say the same thing.
- Create a **draft** release so the user can review the notes alongside the PR:

```bash
gh release create vX.Y --repo apptrackit/finance --draft \
  --target "$(git rev-parse HEAD)" \
  --title "vX.Y" \
  --notes-file /tmp/finance-vX.Y-release.md
```

## 8. Merge and publish (requires explicit approval)

Stop and ask the user before merging and publishing; `AGENTS.md` forbids merging without a request. `main` requires an approving review, so an admin merge also needs the user's explicit go-ahead.

After approval and once CI (`CI passed`) is green:

```bash
gh pr merge <pr> --repo apptrackit/finance --merge --match-head-commit <release-commit-sha>
git fetch origin main
# The merge commit must contain exactly the reviewed release tree
git diff --exit-code <release-commit-sha> <merge-commit-sha>
gh release edit vX.Y --repo apptrackit/finance --target <merge-commit-sha> --draft=false --latest
```

Use a merge commit (not squash) so `PREV..vX.Y` keeps the full history.

## 9. After publishing

- Verify: `gh release view vX.Y --repo apptrackit/finance --json name,tagName,isDraft,publishedAt,targetCommitish,url` shows a published, latest release whose title equals its tag name and whose tag points at the merge commit, and the release body matches the changelog section.
- Check `publishedAt` (UTC) against the date in the changelog heading. If they differ, open a small follow-up PR that corrects the heading date and the README anchor. This is the only routine post-release changelog edit.
- Fast-forward local `main` (`git switch main && git merge --ff-only origin/main`), confirm the release issue closed, and tick its completion checkboxes.
- Tell the user the release URL and that the app has **not** been deployed. Deploy only when asked (`npm run deploy`, which applies pending migrations first; see `AGENTS.md`).

## Rules

- Never move, delete, or recreate a published tag or release; fix mistakes with a follow-up release or by editing the release notes.
- Never force-push `main` or publish from an unmerged branch.
- Keep changelog, GitHub release notes, and README in agreement.
- Between releases, feature and fix PRs should add a short line to `Unreleased`; the release audit in step 3 still checks for anything missed.
