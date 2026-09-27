# Contributing to Equator

Thanks for taking an interest. This repository holds the Equator website and its documents.

## Ground rules

- **No invented facts.** Do not add addresses, figures, links or dates that have not been stated by the project. If a fact is unknown, show `—`.
- **Every external fact is one record** in `src/register.json`, with a state of `stated`, `absent` or `unconfirmed`. Links are stored as URLs and their handles are derived.
- **No wallet code.** The site never connects wallets or requests signatures.
- **Colours** live only in `src/tokens.css`.
- **Motion** uses `transform` and `opacity` only, and respects `prefers-reduced-motion`.

## Workflow

1. Open an issue describing the change, or comment on an existing one.
2. Branch from `main` and keep the change small and focused.
3. Run both checks before you open a pull request:

   ```bash
   npm run build
   npm run gates
   ```

4. Describe what changed and why. Include screenshots for visual changes at 360, 390, 430, 1366 and 1440 pixels wide.

## Reporting a problem

For a bug, say what you expected, what happened, and your browser and viewport. For a security concern, do not open a public issue. Contact the maintainers through an official channel once one is published.

## License

By contributing you agree that your work is released under the [MIT License](../LICENSE).
