# Korets Museum Digital Collection

A local touchscreen catalogue for the Korets Historical Museum. Visitors can browse exhibits and inspect GLB models in 3D. Museum staff can manage exhibit information and upload local models through a PIN-protected interface.

The application is intended to run on a Windows 11 computer connected to a large horizontal display. It can work without internet after installation; internet is only needed for GitHub updates.

## Windows setup

See [MUSEUM-SETUP.md](MUSEUM-SETUP.md) for installation, launch, local-network testing, storage and backup instructions.

## Local data

Uploaded models, images, catalogue changes and the administrator PIN are stored outside this repository in `%LOCALAPPDATA%\KoretsMuseum`. Updating the code does not overwrite museum content. Never add that folder or an administrator PIN to GitHub.

## Development

Requirements: Node.js 22+, pnpm 11 and Git.

```text
pnpm install
pnpm dev
```

The website uses port `3000`; the local data service uses port `3001`.
