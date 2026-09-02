---
title: Project Coding Instructions
description: Required coding, documentation, pull request, and release practices.
---

## Project Context

Workspace Downloads is a VS Code extension for downloading selected workspace files to a local desktop destination. It supports one-off file and glob selections plus repeatable workspace-scoped configuration, including remote workspaces.

## Architecture

* `src/extension.ts` registers commands and owns the user interaction flow.
* `src/selection.ts` parses and resolves workspace-relative files and glob patterns.
* `src/transfer.ts` safely plans destination paths and copies files to the local filesystem.
* `src/command-helpers.ts` contains workspace configuration and source-folder selection helpers.
* `src/test/` contains Mocha tests that mirror the source module names.
* Root `package.json` owns extension metadata, commands, settings contributions, and npm scripts.

## Ponytail Approach

Act as an efficient senior developer: the best code is code that does not need to be written. After understanding the task and tracing the controlling code path, stop at the first option that satisfies the requirement:

1. Decide whether the requested behavior is necessary.
2. Reuse an existing project helper, pattern, or command.
3. Use Node.js or TypeScript standard-library functionality.
4. Use a VS Code or operating-system platform capability.
5. Use an already installed dependency.
6. Use the smallest straightforward implementation.

Prefer deletion over addition, existing patterns over new abstractions, and a focused root-cause fix over per-caller patches. Do not add dependencies, boilerplate, speculative configuration, or abstractions without a demonstrated need.

Never optimize away input validation at trust boundaries, error handling that prevents data loss, security, accessibility, explicitly requested behavior, or a focused runnable check for non-trivial logic.

## Normal Changes

For every change:

* Keep the implementation focused and preserve existing extension behavior unless the task explicitly changes it.
* Add or update focused tests for changed behavior. Do not change unrelated tests to mask failures.
* Update user-facing documentation when commands, settings, workflows, limitations, or supported behavior change. Keep `README.md` and `CHANGELOG.md` consistent with the shipped extension.
* Use the existing extension conventions: TypeScript in `src/`, tests in `src/test/`, and configuration contributions in the root `package.json`.
* Run the narrowest relevant validation. Run `npm run compile` for source changes and `xvfb-run -a npm test` when behavior or tests change.

## Pull Requests

Before creating a pull request:

* Explicitly determine whether this is a release pull request. Do not assume a feature pull request is non-release when it is being prepared for publication.
* Review the diff for unrelated changes and generated files.
* Provide a concise summary, linked issue when applicable, user-facing impact, and the validation commands with their results.
* Call out any tests that were not run or checks that could not be completed.

## Release Pull Requests

When preparing a pull request for a Marketplace release, complete all of these steps before requesting review:

* Choose the target semantic version and update the root `package.json` `version`.
* Add a dated section for that exact version in `CHANGELOG.md`, using the existing change categories and concise user-facing entries. Do not leave release changes under `Unreleased`.
* Confirm the changelog covers every user-visible change since the prior release and does not include unreleased work that is absent from the pull request.
* Do not commit generated `.vsix` artifacts unless the release process explicitly requires it.
* Run `npm ci`, `npm run compile`, `xvfb-run -a npm test`, and `npm run package:vsix`.
* Confirm the release workflow input will exactly match `package.json` without the `v` prefix. The workflow tags the release commit as `v<version>`, publishes the generated VSIX, and creates the GitHub release.

Include the target version and validation results in the pull request description.
