---
title: Download Build Artifacts After a Task
description: Configure Workspace Downloads to copy task output after a successful build
ms.date: 2026-09-02
ms.topic: how-to
---

## Overview

Use `workspaceDownloads.taskDownloads` when a build script produces files that
must be copied to your local desktop after the build completes. Run the script
as a VS Code task. When the task exits with code `0`, Workspace Downloads finds
the matching task definition and downloads its configured files.

A task is the recommended integration point because it provides an exact task
label and a success or failure exit code. Running a script directly in an
integrated terminal does not provide an extension command hook.

## Configure a PowerShell Build

Create `scripts/hello-world-build.ps1` in the workspace:

```powershell
$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path temp | Out-Null
"Hello from the build at $(Get-Date -Format o)" |
    Set-Content -Path temp/hello-world.txt
```

Create `.vscode/tasks.json` and define a task that runs the script:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Build hello world",
      "type": "shell",
      "command": "& \"${workspaceFolder}\\scripts\\hello-world-build.ps1\"",
      "problemMatcher": []
    }
  ]
}
```

Open **Preferences: Open Workspace Settings (JSON)** from the Command Palette
and add a matching download definition:

```json
{
  "workspaceDownloads.taskDownloads": [
    {
      "task": "Build hello world",
      "files": "temp/hello-world.txt",
      "destination": "C:\\temp\\workspace-downloads-test",
      "conflictPolicy": "replace"
    }
  ]
}
```

The task label and the `task` value must match exactly. Run **Tasks: Run Task**,
then select **Build hello world**. The script creates `temp/hello-world.txt`.
After it succeeds, the extension copies it to
`C:\temp\workspace-downloads-test\temp\hello-world.txt`.

## Configure a Shell Build

For Bash, create `scripts/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

mkdir -p build
printf 'Build completed at %s\n' "$(date --iso-8601=seconds)" > build/app.bin
```

Define its VS Code task:

```json
{
  "label": "Build application",
  "type": "shell",
  "command": "bash \"${workspaceFolder}/scripts/build.sh\"",
  "problemMatcher": []
}
```

Add the corresponding workspace setting:

```json
{
  "workspaceDownloads.taskDownloads": [
    {
      "task": "Build application",
      "files": "build/app.bin",
      "destination": "/local/artifacts",
      "conflictPolicy": "replace"
    }
  ]
}
```

## Configure Multiple Tasks

Each definition is independent. A task can download a different artifact set,
to a different destination, with its own conflict behavior:

```json
{
  "workspaceDownloads.taskDownloads": [
    {
      "task": "Build firmware",
      "files": "build/firmware.bin\nbuild/firmware.elf",
      "destination": "C:\\temp\\firmware",
      "conflictPolicy": "replace"
    },
    {
      "task": "Export diagnostics",
      "files": "reports/*.json\nlogs/latest.txt",
      "destination": "C:\\temp\\diagnostics",
      "conflictPolicy": "skip"
    }
  ]
}
```

`files` contains newline-separated workspace-relative file paths or glob
patterns. Downloaded files keep their workspace-relative directory structure
under the destination.

## Expected Behavior

* A matching task triggers a download only when it exits with code `0`.
* Failed, cancelled, global, and non-process tasks do not trigger downloads.
* `replace` overwrites existing files, and `skip` preserves them. Use `prompt`
  when a user should choose during the download.
* Set a destination for every task definition. Task-triggered downloads do not
  prompt for a destination.
* Each definition applies to the workspace folder that owns the task. In a
  multi-root workspace, put folder-specific definitions in that folder's
  `.vscode/settings.json`.

## Troubleshooting

If a successful task does not download files, reload the VS Code window after
installing or updating the extension. Then check that the task label is an
exact match, the task is defined for a workspace folder, the configured files
exist after the script completes, and the destination is a valid local folder.
Open the **Workspace Downloads** output channel for unmatched paths and copy
failures.
