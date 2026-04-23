# PinStack Official Icon Assets

Frozen in `v2.4.9`.

- `app`
  - Source of truth: `app/pinstack-app-icon-master.png`
  - Packaging input: `app/icon.icns` (`build.icon` and `build.mac.icon`)
  - Role: app and DMG branding

- `tray`
  - Source of truth: `tray/pinstack-menubar-template.png`
  - Retina: `tray/pinstack-menubar-template@2x.png`
  - Runtime usage: `src/main/tray.ts`
  - Role: menu bar small-size recognition

- `floating-button`
  - Source of truth: `floating-button/pinstack-floating-button-icon.svg`
  - Reference exports: `floating-button/png/`
  - Role: desktop entry reference asset, aligned with current in-product launcher language

Validation:

- `app/png/*` has been checked against `design-system/01_Brand_Icons/approved_assets/png/app-icon/*`
- `floating-button/png/*` has been checked against `design-system/01_Brand_Icons/approved_assets/png/floating-button/*`
- `app` / `floating-button` primary source files are byte-identical to `approved_assets`
- `tray` runtime uses the frozen template pair:
  - `tray/pinstack-menubar-template.png`
  - `tray/pinstack-menubar-template@2x.png`

Notes:

- `app-icon`, `menubar-icon`, and `floating-button` intentionally do not share the exact same silhouette.
- They are treated as one family with different responsibilities.
- The runtime floating button remains code-rendered in the product; this folder stores the approved visual reference assets.
