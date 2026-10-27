# NPM Package Release & Publishing Guide

This guide covers how to setup, test, version, and publish the `ai-employee-sdk` npm package to the official npm registry for production use.

---

## 1. Package Overview

- **Package Name**: `ai-employee-sdk`
- **Location**: `packages/integration-sdk`
- **Access Level**: Public (`--access public`)
- **License**: MIT
- **Target Runtime**: Node.js `>= 20.0.0`
- **TypeScript**: `5.x`

---

## 2. Prerequisites

1. **NPM Account & Organization**:
   - Ensure you have an account at [npmjs.com](https://www.npmjs.com/).
   - If publishing under the `@ai-employee` scope, ensure your npm user belongs to the `ai-employee` organization on npm, or has permission to create packages under that scope.

2. **Generate NPM Granular / Automation Access Token**:
   - Go to **npmjs.com** -> **Access Tokens** -> **Generate New Token**.
   - Choose **Granular Access Token** or **Automation Token** (bypasses 2FA for CI/CD).
   - Grant read and write access to the `@ai-employee` package scope.

---

## 3. Step-by-Step Manual Release

From the monorepo root or package directory:

### Step 3.1: Navigate to the Package
```bash
cd "packages/integration-sdk"
```

### Step 3.2: Clean and Build TypeScript
```bash
pnpm clean
pnpm build
```

### Step 3.3: Run Automated Test Suite
```bash
pnpm test
```
Ensure all tests (parameter validation, knowledge feeds, idempotency, auth hooks, Express/NestJS adapters) pass with 0 failures.

### Step 3.4: Inspect Tarball Packaging (Dry Run)
```bash
npm pack --dry-run
```
Verify that the output contains:
- `dist/` (all `.js`, `.d.ts`, and `.d.ts.map` files)
- `README.md`
- `LICENSE`
- `package.json`

### Step 3.5: Bump Version (Semantic Versioning)
```bash
# For a bugfix or minor patch:
npm version patch

# For new features (backwards-compatible):
npm version minor

# For breaking API changes:
npm version major
```

### Step 3.6: Login to NPM (if not logged in)
```bash
npm login
```
Follow the browser authentication or enter your credentials and 2FA code.

### Step 3.7: Publish to NPM
```bash
npm publish --access public
```

---

## 4. Automated CI/CD Publishing via GitHub Actions

To automate publishing on GitHub Releases, configure GitHub Actions:

### Step 4.1: Add GitHub Repository Secret
1. In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions**.
2. Click **New repository secret**.
3. Name: `NPM_TOKEN`
4. Value: Paste your NPM Automation Token.

### Step 4.2: GitHub Actions Workflow (`.github/workflows/publish-sdk.yml`)
Create `.github/workflows/publish-sdk.yml`:

```yaml
name: Publish ai-employee-sdk

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      version_bump:
        description: 'Version bump type (patch, minor, major)'
        required: true
        default: 'patch'
        type: choice
        options:
          - patch
          - minor
          - major

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 9.12.0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build SDK
        run: pnpm --filter ai-employee-sdk build

      - name: Run Tests
        run: pnpm --filter ai-employee-sdk test

      - name: Publish to NPM
        working-directory: packages/integration-sdk
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## 5. Consumer Installation & Testing

Once published, any external developer or business system can install and use it immediately:

```bash
npm install ai-employee-sdk
```

```ts
import { registerAction, createExpressRouter } from 'ai-employee-sdk/express-adapter';
import express from 'express';

registerAction({
  name: 'check_status',
  description: 'Checks server status',
  parameters: {},
  handler: async () => ({ status: 'ONLINE', timestamp: new Date().toISOString() }),
});

const app = express();
app.use(express.json());
app.use('/ai', createExpressRouter());
app.listen(5000);
```

---

## 6. Pre-flight Production Checklist

Before publishing a release:
- [x] All TypeScript declarations (`dist/*.d.ts`) compile cleanly.
- [x] Automated test suite (`test/sdk.test.js`) runs with 100% pass rate.
- [x] Package metadata (`package.json`) has correct `name`, `version`, `exports`, `keywords`, `license: MIT`, and `publishConfig.access: "public"`.
- [x] `LICENSE` file is included in package root.
- [x] `README.md` is complete with copy-pasteable examples for Express, NestJS, and Next.js / Fastify.
- [x] Monorepo applications (`apps/api` and `apps/web`) build cleanly alongside the SDK.
