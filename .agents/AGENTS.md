# Project Rules & Guidelines

These guidelines dictate the expected behavior and workflow for any AI agents operating within this repository.

## 1. Coding Style Guidelines
- **Backend (Node.js)**: Use ES6 syntax. Prioritize async/await over raw Promises. Keep middleware modular. Use `pino` for logging, never `console.log`. Validate all external inputs at the boundary using `zod`.
- **Frontend (React)**: Use functional components and hooks. Maintain the Dark/Light mode CSS variable structure in `index.css`. Keep components modular.
- **Edge Agent (Python)**: Use standard Python conventions (PEP 8). Use the built-in `logging` module. Ensure graceful shutdown on KeyboardInterrupt.

## 2. Version Control and Commits
- Use semantic commit messages (e.g., `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).
- Commits should be atomic and represent a single logical change.

## 3. Security (NEVER COMMIT SECRETS)
- **CRITICAL**: Never commit `.env` files, hardcoded JWT secrets, database passwords, or API keys to source control.
- Always read secrets from environment variables.
- Maintain an up-to-date `.env.example` file with dummy values for new developers.

## 4. Test-Before-Merge Rule
- **Mandatory Verification**: Before completing any task or marking a phase as finished, you MUST verify the changes end-to-end.
- For UI changes, use the browser subagent to capture a screenshot of the dashboard, confirm login works, check that live telemetry updates, and verify that AC controls execute a full round-trip successfully.
- Do not assume code works just because it compiles/runs without immediate errors.
