# PR Review Agent

Global, repository-agnostic AI-powered GitHub pull request reviewer.

## What it does

When connected to a repository, the agent can review pull requests for:

- correctness and likely bugs
- security risks
- performance problems
- architecture and maintainability
- missing or weak tests
- accessibility concerns
- dependency impact

The core reviewer is domain-agnostic. A consuming repository can provide optional rules in `.github/pr-review.yml`.

## Architecture

```
Pull Request
    ↓
Reusable GitHub Actions workflow
    ↓
PR metadata + diff + repository rules
    ↓
AI provider
    ↓
Structured findings
    ↓
GitHub PR review & inline comments
```

Gemini is the first provider, but the provider interface is intentionally replaceable.

## Using the global workflow

A repository can add a small caller workflow:

```yaml
name: PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    uses: Karthik22296/pr-review-agent/.github/workflows/pr-review.yml@main
    secrets:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

For organization-wide adoption, keep the Gemini secret configured in each consuming repository or at the organization level according to your GitHub setup.

## Optional repository rules

A consuming repository may add:

```text
.github/pr-review.yml
```

Example:

```yaml
review:
  enabled: true

rules:
  security: true
  performance: true
  architecture: true
  testing: true

custom_rules:
  - "All database writes must use transactions."
  - "Do not expose internal exception details through API responses."
```

These rules are treated as review instructions/data. The global agent remains independent of any one domain.

## Security model

- The AI key is supplied through GitHub Actions secrets.
- The reusable workflow does not execute the PR's application code.
- Repository-specific configuration is read as data.
- Do not use `pull_request_target` for jobs that execute untrusted PR code.
- The initial reviewer only comments; it does not merge, approve, or modify code.

## Development

```bash
npm ci
npm run build
```

Environment variables:

- `GEMINI_API_KEY`
- `AI_PROVIDER`
- `AI_MODEL`
- `REVIEW_CONTEXT`

## Roadmap

1. Initial reusable workflow and Gemini provider
2. Better repository/framework detection
3. Inline diff comments
4. Static-analysis/test result integration
5. Finding validation and duplicate suppression
6. Additional AI providers
7. Review metrics and administration
