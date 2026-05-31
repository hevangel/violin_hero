# Contributing

Violin Hero uses a normal GitHub pull request flow with one special rule:

Human contributors must not write repository code by hand.

## AI-Only Code Policy

- Humans may open issues, describe bugs, request features, review code, test builds, and approve pull requests.
- Humans must not manually edit source code, tests, configuration, scripts, or generated project files.
- All implementation changes must be produced by an AI coding agent following `AGENTS.md`.
- If a human spots a bug in AI-written code, they should describe the bug and ask an AI agent to make the fix.

This keeps implementation provenance consistent and makes every code change reproducible from a request, task, or review comment.

## Normal PR Flow

1. Open or choose an issue that describes the desired change.
2. Create a feature branch.
3. Ask an AI agent to implement the change.
4. Run the relevant checks.
5. Open a pull request with a clear summary and test results.
6. Request review.
7. Address review comments through AI-generated follow-up commits.
8. Merge after approval and passing checks.

## Review Checklist

- The change matches the issue or task.
- No human-written code was added.
- Tests were added or updated when behavior changed.
- The frontend still builds.
- The backend still passes tests.
- No secrets or local machine paths were committed.

## Local Checks

Frontend:

```powershell
cd frontend
npm test
npm run build
```

Backend:

```powershell
cd backend
uv run pytest
```
