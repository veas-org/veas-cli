# Setting up the veas-cli GitHub Repository

## Steps to create and push the standalone repository

1. **Create a new GitHub repository**
   - Go to https://github.com/organizations/veas-org/repositories/new
   - Name: `veas-cli`
   - Description: "Command-line interface for Veas platform with MCP support"
   - Make it public
   - DO NOT initialize with README, .gitignore, or license (we already have them)

2. **Push the extracted code to GitHub**

   From the veas-cli-standalone directory, run:

   ```bash
   # Add the GitHub remote
   git remote add origin https://github.com/veas-org/veas-cli.git

   # Push the branch to GitHub
   git push -u origin veas-cli-branch:main
   ```

3. **Clean up the original repository**

   Go back to the main veas repository:

   ```bash
   cd /Users/marcin/Projects/ts/veas

   # Remove the worktree
   git worktree remove ../veas-cli-standalone

   # Delete the local branch
   git branch -D veas-cli-branch
   ```

4. **Set up the new repository**

   Clone the new repository:

   ```bash
   cd ~/Projects
   git clone https://github.com/veas-org/veas-cli.git
   cd veas-cli
   npm install
   npm run build
   ```

5. **Configure GitHub repository settings**

   In the GitHub repository settings:

   - **Secrets**: Add the following secrets for GitHub Actions:
     - `NPM_TOKEN`: Your npm authentication token for publishing
     - `VEAS_API_URL`: The API URL for E2E tests
     - `VEAS_TEST_EMAIL`: Test account email
     - `VEAS_TEST_PASSWORD`: Test account password
     - `CODECOV_TOKEN`: (Optional) Token for code coverage reports

   - **Branch protection**: Set up branch protection rules for `main`:
     - Require pull request reviews
     - Require status checks to pass (CI tests)
     - Require branches to be up to date

   - **Pages**: (Optional) Enable GitHub Pages from the `main` branch `/docs` folder

6. **Future synchronization** (Optional)

   If you want to push future changes from the monorepo to the standalone repo:

   ```bash
   # From the veas repository
   git subtree push --prefix=apps/veas-cli https://github.com/veas-org/veas-cli.git main
   ```

   To pull changes back from the standalone repo:

   ```bash
   # From the veas repository
   git subtree pull --prefix=apps/veas-cli https://github.com/veas-org/veas-cli.git main
   ```

## NPM Publishing

To publish the package to npm:

1. Login to npm:
   ```bash
   npm login
   ```

2. Publish:
   ```bash
   npm publish
   ```

The GitHub Actions will automatically publish to npm when you create a new release tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Installation

Once published, users can install the CLI globally:

```bash
npm install -g veas-cli
```

Or use it with npx:

```bash
npx veas-cli --help
```
