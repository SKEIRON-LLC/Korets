# Korets Museum: Windows setup

The site runs only on the museum PC. `Launch-Museum.bat` checks GitHub for code updates (once this folder is a Git checkout with an `origin` remote), installs dependencies, starts the local catalog and data service, then opens the site. Staff can double-click it after a restart or to update the site. A previous museum copy started by this launcher is safely stopped and replaced.

For temporary testing from another screen on the same private network, run `Enable-Museum-Network.bat` once and approve the Windows administrator prompt. Then use `Launch-Museum-Network.bat`. It makes only ports 3000 and 3001 available to the local subnet and prints the address to open. Return to `Launch-Museum.bat` for local-only operation.

One-time remote setup via AnyDesk:

1. Install Node.js 22 or newer, Git, and pnpm 11. Ensure `node`, `git`, and `pnpm` work from Command Prompt.
2. Clone the public repository `https://github.com/SKEIRON-LLC/Korets.git` to a permanent folder on the museum PC. Do not run it from Downloads or a ZIP. Create a desktop shortcut to `Launch-Museum.bat`.
3. Run `Setup-Admin-PIN.bat` once and record the displayed six-digit PIN securely. It will not display again. This file refuses to overwrite an existing PIN.
4. Run `Launch-Museum.bat`. In Edge/Chrome, touch the fullscreen icon at the top right. Touch it again to leave fullscreen. Use the gear icon and PIN for staff editing.
5. Enable the Windows touch keyboard in taskbar settings if it does not appear when a text field is touched. Staff need the on-screen keyboard for exhibit information and illustrated articles.

Uploaded GLB models, images, exhibit descriptions, articles and the PIN are stored under `%LOCALAPPDATA%\KoretsMuseum`, outside the Git repository. Articles are kept in `articles.json`; their portraits and inline images are stored in the shared `assets` folder. Back up the entire `KoretsMuseum` folder regularly. Git updates do not touch it. The first launch seeds the 3D catalog with the example exhibits in this repository; later edits are kept in the local data folder. Only `.glb` models and PNG/JPEG/WebP images are accepted, with a 100 MB per-file limit.

The public GitHub repository contains code and bundled example media, not the PIN or locally uploaded museum content. Updates use `git pull --ff-only`; manual code changes on the museum PC should be avoided. The site's local services listen on loopback only, so other PCs cannot access the admin panel. Use a different, private PIN for the actual museum installation; the development PIN is only for testing.
