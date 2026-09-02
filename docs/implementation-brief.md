# Workspace Downloads Version One Implementation Brief

## Product Definition

Build and publish the open-source VS Code desktop extension **Workspace
Downloads**. It downloads selected files from the currently open workspace to
a chosen folder on the local desktop client.

The same workflow must support local folders and remote workspaces. Supported
remote workspace types are Remote SSH, Dev Containers, WSL, Remote Tunnels, and
desktop-client Codespaces. Browser VS Code and web Codespaces are not supported.

The extension runs in the UI extension host through `extensionKind: ["ui"]`.
It reads workspace URIs through `vscode.workspace.fs` and writes output with
the local Node.js filesystem. It must not create remote connections, manage
credentials, synchronize directories, upload files, or implement its own
remote filesystem.

The public Marketplace identifier is selected during publisher registration.
Use `workspace-downloads` as the extension name and command namespace unless
the selected publisher already owns a conflicting identifier.

## Commands

Contribute these Command Palette commands under the `Workspace Downloads`
category:

* `Workspace Downloads: Download Workspace Files...`
* `Workspace Downloads: Download Configured Files`

Do not add a single-file Explorer context-menu command. VS Code already offers
a single-resource download action; the extension's value is batch and
repeatable downloads.

### Ad Hoc Download

`Download Workspace Files...` accepts optional programmatic arguments:

```ts
vscode.commands.executeCommand(
  'workspace-downloads.downloadFiles',
  'reports/result.json;logs/*.txt',
  'C:\\temp\\project-a',
  vscode.Uri.file('C:\\workspace\\project-a')
);
```

The first argument is a semicolon-separated flat list of exact
workspace-relative paths and glob patterns. The second is an optional local
destination folder. The third is an optional `vscode.Uri` identifying the
source workspace folder. It is ignored for a single-root workspace. In a
multi-root workspace, programmatic invocation requires it, and it must exactly
match an open workspace-folder URI. Missing interactive values prompt the user.
An empty or whitespace destination opens the local folder picker.

Prefill interactive prompts from the previous ad hoc values for the current
workspace. Save these values after an export starts successfully in
`context.workspaceState`. They are not shared or committed.

### Configured Download

`Download Configured Files` reads only the workspace configuration below. It
does not fall back to user defaults or remembered ad hoc file values. A missing
file list shows an actionable error that opens the relevant workspace Settings
page. When no destination is configured, it prompts with the remembered
destination for that workspace folder; an empty response opens the local folder
picker.

```json
{
  "workspaceDownloads.files": "reports/result.json\nlogs/*.txt",
  "workspaceDownloads.destination": "C:\\temp\\project-a"
}
```

Contribute both settings with `resource` scope so each workspace folder can
have its own `.vscode/settings.json` file. Select the source folder first, then
resolve settings with
`getConfiguration('workspaceDownloads', sourceFolder.uri)`. The configured
download reads `workspaceFolderValue` first, then `workspaceValue`; it ignores
user, remote-user, and default values. Settings in a `.code-workspace` file
count as `workspaceValue`.

`workspaceDownloads.files` is a multiline string containing one exact path or
glob pattern per nonempty line. `workspaceDownloads.destination` is a string.
Document that a local destination committed to workspace settings is not
portable across collaborators or client operating systems.

## Selection and Resolution

* Preserve exact path casing. Do not lowercase or case-fold filenames.
* Require `/` as the separator for exact paths and glob patterns on every OS.
  Reject `\\` rather than normalizing it.
* Split ad hoc input on semicolons and configured input on line breaks. Trim
  entries, discard individual blanks, and deduplicate exact normalized entries.
  A list containing only blanks is invalid.
* Preflight every entry and report all invalid entries together. Any invalid
  entry aborts the complete export before writing anything.
* Reject absolute paths, paths containing `..`, empty paths, directories, and
  paths containing `\\`.
* Resolve exact files relative to the selected workspace folder.
* Resolve patterns using `vscode.workspace.findFiles`; retain the provider's
  matching semantics and workspace exclude behavior.
* Deduplicate the final resolved URIs before download.
* Individually unmatched valid exact paths or patterns do not prevent matching
  files from transferring. Log and report them as unmatched. An otherwise valid
  list that resolves to zero files shows an actionable informational message
  and starts no transfer.
* In a multi-root workspace, ask the user to select the source workspace
  folder before interpreting exact paths or patterns. Programmatic invocation
  must require a workspace-folder argument or reject ambiguity with a clear
  error.
* Preserve the source path relative to the selected workspace folder below the
  destination folder.
* Canonicalize the chosen existing destination root with `realpath`. Reject any
  pre-existing symlink below that root in an output path. Validate containment
  using the canonical destination and canonical existing ancestors; reject
  paths that would escape the canonical destination.
* Detect case-insensitive destination collisions, such as `Readme.md` and
  `README.md`, and process them as file conflicts. Sort resolved source files
  by their case-sensitive workspace-relative `/` path. For a collision, the
  first sorted file wins with `Skip All` and the last sorted file wins with
  `Replace All`; log every collision and both source paths.

## Conflict and Transfer Behavior

Run one export at a time. Before the first existing-file or destination
collision overwrite, ask once per export: `Replace All`, `Skip All`, or
`Cancel`. Apply the selected policy to the remaining affected files.

Copy files sequentially. For each file, create its parent directory, write to
a unique temporary sibling path, and rename the completed temporary file to its
final path. For a replacement, delete the existing regular target before the
rename. Delete temporary files after failures or cancellation when possible.
Replacement is atomic only when the target did not already exist.

Use `vscode.window.withProgress` with a cancellation token. Cancellation takes
effect between source files because `workspace.fs.readFile` is a whole-file
operation. Continue after a normal per-file failure and report it at completion.

There is deliberately no per-file buffered-read size limit in version one.
The stable API returns the entire source as a `Uint8Array`; a very large file
can exhaust extension-host memory. Document this limitation prominently and do
not promise streaming, resumability, byte-level progress, or within-file
cancellation.

Show progress with the current relative path and counts for completed, skipped,
and failed files. On completion, display a concise summary with `Open
Destination` and `Show Output` actions. Send detailed paths and errors, but
never file content, to a dedicated output channel.

## Quality Requirements

Add automated coverage for:

* Exact paths, patterns, blanks, normalization, traversal, and absolute paths
* Local and remote-style URI resolution through the filesystem abstraction
* Multi-root source-folder selection and programmatic ambiguity rejection
* Remembered ad hoc source and destination values scoped per workspace
* Configured values, including missing and malformed configuration
* Existing files, replace-all, skip-all, cancellation, and per-file failures
* Temporary-file cleanup and output-path containment
* Case-sensitive sources that collide at a case-insensitive destination

Retain TypeScript strictness and linting. Run compilation, linting, and the
extension-host test suite on every pull request. Validate manually before each
release on a local workspace and representative Remote SSH, Dev Container, and
WSL workspace windows.

## Open Source Repository

Host the project on GitHub under the MIT License. Include:

* `LICENSE`
* A Marketplace-oriented `README.md` with local and remote examples,
  configuration reference, limitations, and privacy statement
* `CHANGELOG.md`
* `CONTRIBUTING.md`
* GitHub issue templates for bugs and feature requests
* A repository security policy or `SECURITY.md`

Do not collect telemetry in version one. Do not require accounts, external
services, or credentials.

## GitHub Actions

Repo: https://github.com/jantielens/vscode-workspace-downloads
Main branch: `main`

Create two workflows.

### Continuous Integration

Run on pull requests and pushes to the default branch:

1. Install the locked Node.js version from the project configuration.
2. Run `npm ci`.
3. Run compile and lint checks.
4. Run extension-host tests using a Linux display solution such as `xvfb-run`.
5. Package a VSIX without publishing it.
6. Upload the VSIX as a workflow artifact.

Set minimal job permissions. Use dependency caching only when it does not hide
lockfile changes. Fail the workflow when packaging validation fails.

### Marketplace Release

Use a manually dispatched workflow with a required tag input. It must:

1. Require an existing annotated `vX.Y.Z` tag, check out that tag, verify its
  `package.json` version equals `X.Y.Z`, and verify that version is not already
  published.
2. Run the same install, compile, lint, test, and packaging steps as CI.
3. Publish the VSIX with `vsce` using a Marketplace personal access token held
   only in the `VSCE_PAT` GitHub Actions secret.
4. Create a GitHub Release from that tag and attach the VSIX.

Use a protected GitHub Environment, such as `marketplace`, with required
reviewers for the publishing job. Grant the release job only the additional
`contents: write` permission it needs. Never expose the Marketplace token in
logs or artifacts.

Marketplace publishing requires a publisher account and a token with the
necessary Marketplace permissions. The repository owner must create and store
`VSCE_PAT` before the release workflow can publish. Treat the Marketplace
publisher ID as a repository-owner prerequisite: do not guess it or hard-code a
placeholder into release validation. Until the publisher is created and
`VSCE_PAT` is configured, the workflow may package and attach a VSIX but cannot
publish to the Marketplace.

## Completion Criteria

The version-one implementation is complete when both commands meet the defined
behavior, the automated suite passes, a manually dispatched release workflow
can publish from a protected environment, and the published Marketplace page
accurately describes desktop-only buffered downloads for local and remote
workspaces.