# Saturn Workspace Engineering Contract

The repository-wide engineering instructions supplied by the project owner apply here. The following rules are additional product-specific gates.

## State-aware content

- User-facing copy must be derived from the actual resource and action state.
- A title, status, description, CTA, and available action must never contradict one another.
- Review normal, loading, empty, unavailable, disabled, partial, error, success, and permission-denied states independently.
- Supporting copy is optional. Omit it when it would repeat the title, fill space, describe implementation details, or promise an unavailable action.
- Normal-state marketing copy must not be reused as empty, unavailable, disabled, or error copy.
- Explanations belong behind progressive disclosure unless they are necessary to choose an action or recover from a failure.

Forbidden examples include an unavailable title paired with an instruction to choose a plan, a disabled CTA paired with copy telling the user to press it, and text that exposes provider or source-of-truth implementation details.

## Product contracts

- `account_profiles.firebase_uid` is the canonical Firebase identity column. `account_subscriptions.firebase_user_id` is a separate legacy-compatible subscription column; do not interchange them.
- Plan visibility, plan activity, commercial purchasability, provider readiness, and checkout availability are separate states.
- Payment absence may disable checkout, but it must not hide an otherwise published plan.
- Never expose a shell, mock, disabled integration, or HTTP 200 as a completed production feature.

## Required gates

- Run schema-contract, state-copy, Arabic/English, RTL/LTR, no-mojibake, no-secret, Worker, and production build checks for affected areas.
- Backend authorization is authoritative. UI visibility is never a permission boundary.
- Production migrations must be additive, preflighted, postflighted, and recoverable.
