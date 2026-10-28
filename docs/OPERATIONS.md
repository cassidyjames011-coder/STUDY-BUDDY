# Operations and recovery

## Services and owners

- Source/release: `cassidyjames011-coder/Studioza`, protected `main` after settings are applied.
- Frontend: `studioza` Worker, static `public/` assets, service binding `AI_GATEWAY`.
- AI gateway: existing `floral-wood-c42bbaa1118-gemini-proxy` Worker, unchanged production Durable Object namespace/class and existing secret bindings.
- Isolated test services: `studioza-staging` and `studioza-ai-staging`; no production Gemini key, mock answers only and an independent three-attempt quota. They do not establish real model quality or real token replay behaviour.
- Proposed accountable operator: project maintainer. Named private contact, incident deputy and reviewer are **pending owner input**, not assigned by this document.

## Build, review and deploy

1. Node 24, pnpm 11.25.0. Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm check`, and `pnpm audit --audit-level=high`.
2. Obtain independent PR approval and the required CI check. Do not bypass protection merely to get a release out. Record emergency risk acceptance and follow-up review if an actual incident requires an exception.
3. Deploy staging gateway with `pnpm exec wrangler deploy --config wrangler.staging.jsonc`, then staging frontend with `--config wrangler.frontend-staging.jsonc`. Staging uses Cloudflare's public dummy verification key; never copy production secrets into staging.
4. Configure the production Turnstile widget to allow only the actual production frontend hostname, with action `generate`. Verify production rejects dummy/test tokens. Preserve the real secret values in Cloudflare; do not export them into files, screenshots or logs.
5. After approved merge, deploy the production gateway with `pnpm exec wrangler deploy --config wrangler.jsonc`, then frontend with `--config wrangler.frontend.jsonc`. Existing Cloudflare Git builds must use the intended reviewed branch, locked install/build and matching config. GitHub Pages serves only the migration page, with `public/` and source directories excluded by `_config.yml`.
6. Verify `/build-info.json` and `X-Studioza-Release` match the build; save immutable Cloudflare deployment IDs. Make at most the approved small rejection-only smoke-test budget. A real-generation test requires a separate agreed quota window and synthetic files.

## Limits and observability

The Durable Object atomically reserves at most 100 upstream attempts per UTC day and 10 in a rolling 60-second window for production; staging uses 3/3. Each additional generation batch reserves another attempt. The approximate platform rate binding is an extra throttle, not the strict accounting control. Failed verification consumes no quota reservation. Cancellation after reservation is not refunded, preventing retry/refund abuse.

Search Worker Logs by `requestId` for `request_rejected`, `generation_reserved`, `generation_failed`, `generation_complete`, status and release. Application logs intentionally omit document content, source names/URLs, interests, IPs, security tokens and provider diagnostic text. Invocation logs are disabled in repository config. Owner must verify the deployed logging settings, access and actual retention, and configure alerts (not yet proven): repeated 5xx/security failures, 429 spikes and quota exhaustion. Suggested response trigger: any unexpected sustained 5xx or quota event; final thresholds and on-call recipient require owner approval.

## Incident response

1. Stop inviting users; publish a neutral service message. Ask reporters not to send documents/keys through public issues.
2. Preserve redacted event IDs, release/deployment IDs, timestamps and scope. Do not copy raw uploads into incident tickets.
3. For a suspected exposed credential, operator rotates the affected Cloudflare/Gemini secret at the provider, updates the binding and verifies old credential revocation. Do not merely delete code/history. Do not print the value during the procedure.
4. Restore a reviewed known-good release as below. For data incidents, the designated data-protection reviewer determines notification and retention obligations; this runbook does not make a legal determination.
5. Re-run affected tests and obtain independent closure. Incident owner, support contact and escalation deadline remain required before pilot.

## Rollback and recovery rehearsal

Record current source SHA, release hash, frontend/gateway deployment IDs and binding names before a change. In **staging first**, deploy a harmless release marker and verify it; roll back via Cloudflare deployment history to the recorded known-good versions, gateway then frontend. Verify release headers, static assets, blocked embedding, safe 4xx and mock generation. Record start/end time and results. This drill is not complete until an actual observed staging run is attached.

Rebuild from the reviewed commit and lockfile; redeploy with the existing production namespace and secret bindings. Do not delete or rename the production `DailyQuota` class/namespace, which would reset the cost ceiling. Only the configured binding names are in source, not secret values. Migration `v1` remains; the existing SQLite class creates its additional rolling-attempt table without deleting daily counters. Staging quota IDs include the build release to permit a fresh isolated run on a new reviewed staging build; production ID remains `global-daily-quota`.

## Data/retention checklist

Raw selected documents live only in browser/request memory. Generated questions/progress/interests/preferences are local to the browser profile and expire after 30 days without activity on next opening. Full local reset is available. Provider processing and retention are separate: confirm Gemini project terms/model-training/retention, Cloudflare log retention/region/access, contracts and transfer arrangements. Do not promise zero retention. Supply an evidence retention period and access-controlled storage location before pilot.
