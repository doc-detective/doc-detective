# Auto Dev Release CI/CD Workflow

This repository includes an automated CI/CD workflow that publishes development versions to npm on every commit to the main branch. This enables dependent libraries to consume the latest changes without waiting for formal releases.

## 🚀 How It Works

The **Auto Dev Release** workflow automatically:

1. **Triggers** on every push to the `main` branch
2. **Runs tests** to ensure code quality
3. **Bumps the dev version** (e.g., `3.1.0-dev.1` → `3.1.0-dev.2`)
4. **Publishes to npm** with the `dev` tag
5. **Creates git tags** for version tracking

## 📋 Prerequisites

### Required Repository Secrets

The workflow requires the following repository secret to be configured:

- **`NPM_TOKEN`**: npm automation token for publishing packages

### How to Create NPM Token

1. Log in to [npmjs.com](https://www.npmjs.com)
2. Go to **Access Tokens** in your account settings
3. Click **Generate New Token**
4. Select **Automation** token type
5. Copy the generated token
6. Add it as a repository secret named `NPM_TOKEN`

## 🔧 Configuration

### Package.json Requirements

Your `package.json` must include:

```json
{
  "name": "your-package-name",
  "version": "1.0.0",
  "scripts": {
    "test": "your-test-command",
    "build": "your-build-command"
  }
}
```

### Workflow Features

- **Node.js 18** runtime environment
- **npm ci** for dependency installation
- **Automated git configuration** with github-actions bot
- **Smart skipping** for documentation-only changes
- **Error handling** and rollback capabilities
- **10-minute timeout** to prevent hanging processes

## 📦 Version Management

### Dev Version Pattern

The workflow follows semantic versioning with dev suffixes:
- Base version: `3.1.0`
- Dev versions: `3.1.0-dev.1`, `3.1.0-dev.2`, `3.1.0-dev.3`, etc.

### Version Increment Logic

1. Extract base version from current `package.json`
2. Check latest dev version published to npm
3. Increment dev number by 1
4. If no dev version exists, start with `dev.1`

## 🎯 Usage for Consumers

### Installing Dev Versions

```bash
# Install latest dev version
npm install doc-detective-common@dev

# Or in package.json
{
  "dependencies": {
    "doc-detective-common": "dev"
  }
}
```

### Checking Available Versions

```bash
# List all versions
npm view doc-detective-common versions

# Check current dev version
npm view doc-detective-common@dev version
```

## 🛡️ Safety Features

### Automated Checks

- **Test execution**: All tests must pass before publishing
- **Build validation**: Build process must complete successfully
- **Package.json validation**: Ensures valid JSON and required fields
- **Documentation skip**: Skips release for docs-only changes
- **Infinite loop prevention**: Uses `[skip ci]` in commit messages

### Skip Conditions

The workflow will skip execution if:
- Commit message contains `[skip ci]`
- Commit message contains `Release`
- Event type is `release`
- Only documentation files were changed (`.md`, `.txt`, `.yml`, `.yaml`, `.github/`)

## 🔍 Troubleshooting

### Common Issues

**Publication fails with authentication error:**
- Verify `NPM_TOKEN` secret is correctly configured
- Ensure token has automation permissions
- Check token hasn't expired

**Version conflicts:**
- Workflow automatically handles version increments
- If conflicts occur, manually increment and push

**Tests failing:**
- Fix failing tests before merge
- Workflow will not publish if tests fail

### Manual Trigger

You can manually trigger the workflow:

1. Go to **Actions** tab in GitHub
2. Select **Auto Dev Release** workflow
3. Click **Run workflow**
4. Choose the `main` branch

## 📊 Workflow Output

### Successful Execution

```
✅ Tests passed
✅ Version bumped: 3.1.0-dev.1 → 3.1.0-dev.2
✅ Published to npm with tag 'dev'
✅ Git tag 'v3.1.0-dev.2' created and pushed
```

### Skipped Execution

```
⏭️ Auto dev release skipped
📝 Only documentation changes detected
```

## 🔄 Integration with Main Release Workflow

This workflow complements the existing release workflow:

- **Auto Dev Release**: Automatic dev versions on main branch commits
- **Main Release**: Manual stable releases through GitHub releases
- **No conflicts**: Workflows use different triggers and tags

## 📈 Benefits

- **Faster iteration**: Immediate availability of code changes
- **Reduced bottlenecks**: No manual release process required
- **Better testing**: Dev versions allow thorough testing before stable release
- **Dependency management**: Dependent repositories can consume latest changes instantly

## 🛠️ Extending the Workflow

### Adding Notifications

Add Slack/Teams notifications by including notification steps:

```yaml
- name: Notify team
  uses: your-notification-action
  with:
    message: "🚀 New dev release: v${{ steps.version.outputs.version }}"
```

### Cross-Repository Updates

Extend to automatically update dependent repositories by adding repository dispatch events.

---

For more information about the implementation, see the workflow file: `.github/workflows/auto-dev-release.yml`