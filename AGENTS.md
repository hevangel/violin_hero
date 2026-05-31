# AGENTS.md

Instructions for AI agents working in this repository.

## Mission

Build and maintain Violin Hero, a browser-based rhythm trainer for violin. The app accepts score uploads, converts score data into a playable timeline, animates notes toward the player, listens to microphone input, and scores pitch and rhythm.

## Development Rules

- AI agents may write code, tests, docs, scripts, and configuration.
- Human contributors must not hand-write code in this repository. Humans should describe desired changes in issues, pull requests, or prompts, and let an AI agent produce the implementation.
- Keep changes small, reviewable, and tied to a clear issue or task.
- Prefer existing project patterns over new abstractions.
- Use snake_case for Python identifiers and 4-space indentation.
- Use `uv` for Python dependency management and run Python commands through `uv`.
- Do not commit secrets, local environment files, generated dependency folders, or Audiveris output.

## Project Layout

- `frontend/`: React, Vite, TypeScript browser game.
- `frontend/src/score/`: Score ingestion and parsing.
- `frontend/src/game/`: Pitch detection, music helpers, and scoring.
- `frontend/src/components/`: UI components.
- `backend/`: FastAPI backend for PDF/image OMR through Audiveris.
- `backend/app/omr.py`: Audiveris command wrapper.
- `backend/tests/`: Backend tests.

## Verification

Before opening a PR, run the checks that match your change:

```powershell
cd frontend
npm test
npm run build
```

```powershell
cd backend
uv run pytest
```

## Pull Request Expectations

- Use a normal branch and pull request flow.
- Explain the user-facing outcome and any known limitations.
- Include test results in the PR body.
- Keep unrelated refactors out of feature or bug-fix PRs.
