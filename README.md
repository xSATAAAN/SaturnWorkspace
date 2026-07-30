# Saturn Workspace Web Platform

Canonical web source for the Saturn Workspace public site, customer and admin
frontends, and Cloudflare Workers.

Saturn Workspace is owned and developed by one independent individual/student.
The product name is not a claim that a registered company, institution, or
corporate publisher exists.

- `index.html`: app homepage
- `privacy/`: privacy policy

The site can be promoted to GitHub Pages only through the manual protected
promotion workflow. Merging source does not deploy it.

## Project Structure

- `site/`: React + Tailwind website frontend
  - `src/components/`: modular UI sections and reusable blocks
  - `src/api/`: typed browser API clients for account, subscription, admin, and support flows.
  - `src/constants/`: static display copy and UI constants
- `workers/auth/`: Cloudflare Worker for device login, license/session checks, and Google Drive OAuth config delivery
- `workers/admin/`: Cloudflare Worker backend
  - OTA release routes
  - inactive payment request routes kept for the future replacement payment gateway
  - validation/security/services split for maintainability

## Cloudflare Secrets

Run `scripts\setup-cloudflare-secrets.bat` from Windows to generate local random Worker secrets and upload both auth/admin Worker secrets without saving secret values in the repository.
