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
- `workers/ota-admin/`: Cloudflare Worker backend
  - OTA release routes
  - payment routes for secure checkout orchestration
  - validation/security/services split for maintainability
