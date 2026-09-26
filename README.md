# PR Review Agent

A global, repository-agnostic AI-powered GitHub Pull Request reviewer built with GitHub Actions and TypeScript.

---

## Features

- **Dynamic Model Discovery & Auto-Selection**: Automatically queries Google Generative AI to discover all models available for the provided `GEMINI_API_KEY`. Automatically ranks and selects the optimal model for each task (e.g. latest Pro models for risky/complex PRs, latest Flash models for fast standard reviews and `/ask` queries) without requiring hardcoded model strings.
- **Resilient Model Rotation on Failure**: If the primary selected model experiences an outage, 429 rate limits, 503 capacity overload, or deprecation, the agent automatically rotates through candidate fallback models in real-time until the review succeeds, guaranteeing high availability.
- **Interactive PR Commands (`/ask` & `/review`)**: Developers can ask targeted questions directly on PR comments or diff hunks using `/ask <question>`, or trigger a re-review using `/review`.
- **Quality Gate Commit Status**: Posts a GitHub status check (`AI Review / Quality Gate`) that blocks PR merging on `🔴 CRITICAL` issues while allowing non-blocking issues (`🟠 HIGH`, `🟡 MEDIUM`, `🔵 LOW`, `✅ GOOD`) to pass.
- **Auto-Resolving Addressed Comments**: On incremental commits (`pull_request: synchronize`), comments for issues that have been addressed are automatically marked resolved via GraphQL and acknowledged with a resolution note, while new issues on modified lines get fresh inline comments.
- **Risk-Adaptive Routing**: Automatically triages PR risk based on CI static check failures, critical path modifications (e.g., `auth`, `package.json`), and diff complexity. Routes low-risk PRs to faster models and flags high-risk PRs for deep analysis (increasing findings and lowering confidence thresholds) using a heavier model.
- **Formal GitHub PR Reviews**: Posts official review summaries via `gh pr review`, registering the agent in the PR Reviewers sidebar with review status.
- **1-Click "Apply Suggestion" Blocks**: Inline comments include native GitHub ` ```suggestion ` blocks, allowing developers to commit recommended fixes directly from the PR diff with a single click.
- **PR Risk Assessment & Changes Walkthrough**: Delivers a clear risk level (`🟢 Low`, `🟡 Medium`, `🔴 High`) with rationale alongside a structured Markdown table summarizing file-by-file changes.
- **Noise & Lockfile Exclusion**: Intelligently strips lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), build artifacts (`dist/`, `build/`), minified files (`*.min.js`), and binary assets from the diff and source context to conserve tokens and eliminate false positives.
- **Line-Anchored Inline Comments**: Posts findings anchored to exact file diff lines with automatic `<!-- pr-review-fingerprint -->` SHA-256 deduplication so identical comments are not re-posted across incremental pushes.
- **Repository Stack Detection**: Automatically scans tree blobs to detect languages, frameworks, and tools (Angular, React, Vue, Node.js, Python, Java, Go, Rust, Docker, etc.) and injects tailored context into the prompt.
- **Source Context Enrichment**: Fetches complete source content for modified files to provide the AI model with surrounding context beyond the raw diff.
- **CI / Static Checks Integration**: Aggregates conclusions from preceding or concurrent GitHub Actions check runs (linters, test suites, builds) to inform the review.
- **Customizable Repository Rules**: Consuming repositories can supply `.github/pr-review.yml` to toggle categories, enable/disable reviews, or define project-specific coding guidelines.
- **Automated PR Labels**: Automatically creates and applies the `ai-reviewed` label to pull requests once the review completes.
- **Robust Provider Architecture**: Pluggable AI provider interface with Gemini integration, exponential backoff retries for transient 503/429 errors, and defensive JSON schema validation.

---

## Architecture

```
                 Pull Request Opened / Synchronized
                                ↓
               Caller Workflow (Consumer Repository)
                                ↓
    Reusable Workflow (.github/workflows/pr-review.yml@main)
     ├── Noise & Lockfile filtering (src/filter.ts)
     ├── Git diff & PR metadata collection
     ├── Repository stack detection (src/stack.ts)
     ├── Filtered changed-file source enrichment
     ├── Preceding CI check runs collection
     └── Repository rule loading (.github/pr-review.yml)
                                ↓
                        AI Provider Runner
     ├── Provider Registry (src/providers/registry.ts)
     ├── Gemini Provider with exponential retries (src/providers/gemini.ts)
     └── Defensive schema validation with suggestions (src/validation.ts)
                                ↓
                       Review Publication
     ├── 1-Click inline suggestion comments (src/publish-inline.ts)
     ├── Formal GitHub Review with Risk Badge & Walkthrough Table (gh pr review)
     └── Automated PR labeling (ai-reviewed)
```

---

## Quickstart: Using in Any Repository

To enable automated reviews on a repository, create `.github/workflows/pr-review.yml`:

```yaml
name: AI PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    uses: Karthik22296/pr-review-agent/.github/workflows/pr-review.yml@main
    with:
      ai-model: gemini-3.8-flash # Used for normal, low-risk PRs
      ai-model-deep: gemini-3.1-pro # Used for high-risk, complex PRs
    secrets:
      GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

> **Note on Permissions**:
> The caller workflow must grant `pull-requests: write` and `contents: read` so that the reusable workflow can inspect diffs, fetch source context, and publish formal reviews, inline comments, and labels.

### Secret Setup

Add `GEMINI_API_KEY` to the repository secrets (**Settings → Secrets and variables → Actions**) or configure it at the organization level.

---

## Repository Rules Configuration (`.github/pr-review.yml`)

Consuming repositories can optionally customize review behavior by adding `.github/pr-review.yml` in the root of the repository:

```yaml
# Enable or disable automated AI reviews for this repo
enabled: true

# Toggle specific review categories
correctness: true
security: true
performance: true
architecture: true
testing: true
maintainability: true
accessibility: true
dependencies: true

# Add domain-specific or team-specific rules
custom_rules:
  - "All database operations must be wrapped in transactions."
  - "Do not expose raw internal exception traces in API responses."
  - "Components must use ChangeDetectionStrategy.OnPush."
  - "All HTTP calls must include explicit error handling."
```

---

## Review Output

1. **Official GitHub PR Review (`gh pr review`)**:
   - **Risk Level**: Evaluates overall PR risk (`Low`, `Medium`, `High`) based on security, auth, database, breaking API, or state modifications.
   - **Changes Walkthrough**: A markdown table summarizing changes made to each file.
   - **Findings**: Categorized issues with severity tags and remediation notes.
   - **Recommended Tests**: Suggestions for missing test cases.
   - **Sidebar**: The agent appears as an official reviewer with a `Commented` review badge.
2. **1-Click Inline Diff Comments**:
   - High-confidence findings anchored to specific diff lines.
   - Includes interactive GitHub ```` ```suggestion ```` blocks allowing 1-click commits of proposed fixes.
   - Deterministic SHA-256 fingerprint comments prevent duplicates across incremental PR pushes.
3. **Labels**:
   - Automatically tags pull requests with `ai-reviewed`.

---

## Security Model

- **Safe Execution**: The reusable workflow executes static analysis and prompt generation inside an isolated runner; it never builds or executes untrusted pull request code.
- **Data Boundaries**: Review guidelines and configuration files are read strictly as data.
- **No Direct Merges**: The review agent provides purely informational reviews and suggestions; human review remains authoritative.

---

## Development

### Prerequisites

- Node.js 20+
- npm

### Build

```bash
# Install dependencies
npm ci

# Compile TypeScript
npm run build
```

### Environment Variables

| Variable | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | API key for Google Gemini provider |
| `AI_PROVIDER` | Provider identifier (default: `gemini`) |
| `AI_MODEL` | Model name (default: `gemini-3.8-flash`) |
| `REVIEW_CONTEXT` | Raw string review context (or use `REVIEW_CONTEXT_FILE`) |
| `REVIEW_CONTEXT_FILE` | Path to text file containing review context |
| `REPOSITORY_RULES_FILE`| Path to `.github/pr-review.yml` |

---

## Roadmap

- [x] Reusable GitHub Actions workflow and Gemini provider
- [x] Multi-provider registry interface
- [x] Repository and framework stack detection
- [x] Noise and lockfile filtering (`package-lock.json`, minified files)
- [x] Changed-file source context enrichment
- [x] Static-analysis & CI check result integration
- [x] Defensive finding schema validation
- [x] Line-anchored inline diff comments with SHA-256 fingerprint deduplication
- [x] 1-Click GitHub "Apply Suggestion" blocks
- [x] PR Risk Assessment and File Changes Walkthrough table
- [x] Official GitHub PR Review submission (`gh pr review`)
- [x] Automated PR labeling (`ai-reviewed`)
- [ ] Interactive `/ask` and `/review` PR comment trigger commands
