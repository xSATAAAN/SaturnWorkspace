# Saturn Workspace Legal

Public legal pages for Saturn Workspace.

- `index.html`: app homepage
- `privacy.html`: privacy policy

Designed for GitHub Pages deployment.

## Project Structure

- `site/`: React + Tailwind website frontend
  - `src/components/`: modular UI sections and reusable blocks
  - `src/api/`: typed browser API clients (no sensitive payment logic)
  - `src/constants/`: static display copy and UI constants
- `workers/auth/`: Cloudflare Worker for device login, license/session checks, and Google Drive OAuth config delivery
- `workers/admin/`: Cloudflare Worker backend
  - OTA release routes
  - manual payment request routes until the replacement payment gateway is selected
  - validation/security/services split for maintainability

## Cloudflare Secrets

Run `scripts\setup-cloudflare-secrets.bat` from Windows to generate local random Worker secrets and upload both auth/admin Worker secrets without saving secret values in the repository.
