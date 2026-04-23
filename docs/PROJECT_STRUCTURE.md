# Project Structure

This document defines the current folder responsibilities and the direction for future organization.

## Top-level layout

- `src/`: Electron app source code (main/preload/renderer/shared).
- `native/`: macOS native helpers and `PinStackNotch` Swift package.
- `server/`: local service modules used by desktop runtime.
- `web/`: web-side runtime and assets.
- `scripts/`: build/release/verification scripts.
- `assets/`: static runtime assets (icons, images).
- `docs/`: handover, architecture notes, and operational docs.
- `tests/`: unit and integration tests.
- `dist/`: generated build output (ignored).
- `release/`: packaged artifacts (ignored).

## Source layout

- `src/main/`: Electron main-process orchestration and app services.
- `src/main/windows/`: all window/process controllers and window factory.
- `src/main/services/`: domain services (AI hub, local model, capsule, etc.).
- `src/preload/`: preload bridge entry.
- `src/renderer/`: renderer UI, pages, components, features.
- `src/shared/`: shared types and cross-process contracts.

## Structure rules

- Keep feature-specific code close to feature folders; avoid adding new cross-cutting files to `src/main` root when a domain folder exists.
- Window lifecycle or window creation logic should live in `src/main/windows/`.
- New domain logic should prefer `src/main/services/<domain>/`.
- Keep generated artifacts out of source folders.

## Next recommended refactors

- Split `src/main/index.ts` into lifecycle modules (bootstrap, ipc wiring, runtime orchestration).
- Continue grouping `src/main` runtime utilities into focused subfolders (`capture/`, `runtime/`, `settings/`) as changes happen.
