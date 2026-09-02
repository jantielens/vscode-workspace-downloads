# Contributing

Open an issue before substantial work so the proposal can be discussed. Keep pull requests focused and include tests for changed behavior.

## Local Checks

Use Node.js `22.21.1`, then run:

```bash
npm ci
npm run compile
xvfb-run -a npm test
npm run package:vsix
```

Do not add telemetry, remote connection logic, credential handling, or file contents to logs.