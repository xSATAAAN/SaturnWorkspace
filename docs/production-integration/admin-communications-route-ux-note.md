# Admin Communications Route UX Note

Date: 2026-06-20

## Issue

The current communications page can be reached at:

`https://admin.saturnws.com/admin/communications`

This repeats `admin` because the hostname is already the Admin subdomain.

## Target

After email operations testing is complete, make the primary route:

`https://admin.saturnws.com/communications`

## Required Follow-Up

- Update internal Admin navigation links to use `/communications`.
- Add a safe permanent redirect from `/admin/communications` to `/communications`.
- Preserve old deep links, including query parameters where possible.
- Do not break Admin authentication or authorization.
- Review other Admin routes for the same repeated-prefix pattern before changing routes.
- Keep `https://admin.saturnws.com/admin/communications` working through redirect during transition.

## Status

Deferred until the current email operations live tests finish.
