# Remediation implementation and verification

28 October 2026. This branch addresses the implementation failures in Test 1; it is not a substitute for the original test catalogue or independent sign-off.

| Finding | Implemented mitigation | Verification | Deployment/reviewer closure |
|---|---|---|---|
| SEC-01 | PR workflow, pinned CI actions, read-only CI token, build/test/audit job; branch protection must be applied in GitHub | CI/config source reviewed | Required review/protection and actual independent approval must be evidenced |
| SEC-02 | Only `/api/generate` + `document-sprint`; new strict document contract; no caller tools/system/config; fixed model/limits | Regression tests reject generic/unknown fields/routes and verify server-built upstream request | Needs deployed smoke check |
| SEC-03 | Cloudflare-hosted assets with CSP, frame-ancestors none, nosniff, no-referrer, permissions policy and no-store | Local browser works under actual policy; Worker/frontend dry-run bundles succeed | Requires canonical hosting deployment; GitHub Pages itself cannot set all these headers |
| SEC-04 | Tailwind/Lucide compiled/self-hosted; versions and tooling locked; no inline executable scripts/handlers/eval | Build checks and dependency advisory audit; delegated UI clicks work under CSP | Review/update owner remains an operator duty |
| SEC-05 | Public factual upload/privacy page, upload-safety acknowledgement, clear-all control and 30-day local expiry | Source/unit tests | Named operator/private contact and provider/legal decisions still required; notice says so |
| SEC-06 | Stable public errors and request reference IDs; metadata-only application logs; no upstream diagnostic body returned | Synthetic detail marker stays out of stream/log; safe failure preserves questions/files | Operator must verify deployed logs, retention and alert delivery |
| SEC-07 | Response-level CSP frame-ancestors none and X-Frame-Options DENY | Local iframe rendered browser “content blocked”, not the app | Requires repeat on new canonical deployment |
| SEC-08 | Empty/wrong PDF header/EOF/base64 rejected on client and Worker before provider; bounded stream input | Renamed/empty/corrupt fixtures rejected; ordinary fixture accepted | Basic format validation is not a complete malicious-PDF analysis |

Additional safeguards: strict rolling 10/60 and 100/day reservations in one Durable Object SQLite transaction, with existing production counter retained; bounded upstream response; finite batch/retry/deadline; 10-second verification timeout; staging cannot use production Gemini; production rejects dummy secrets/mock mode; no URL/DNS fetch implementation exposed while website imports are paused.

Local result: **23 security regression tests passed**, including real SQLite SQL/transaction behaviour and request/rendering/frontend failure handling. The Security checks job also passed in GitHub Actions on the initial PR. In Cloudflare's actual local runtime with a real local Durable Object, three mock-only staging requests succeeded; requests four/five returned 429 for the rolling limit, and a later request after the minute returned the daily-limit 429. Request IDs and metadata-only logs were observed. Cloudflare's public dummy verification service does not bind hostname/action, so that exception is limited to dummy-key, mock-only staging; production still requires exact host/action and rejects dummy keys/mock mode. The existing preview build install needed explicit approval of the locked esbuild/workerd lifecycle scripts; those two trusted build tools are allow-listed in pnpm settings.

These are not 23 additional passes in the original 46-test catalogue. Real Cloudflare distributed production runtime, real token replay/expiry, provider settings, model quality, rollback and accessibility-review gates remain as documented in PILOT-GATE.md until supporting evidence exists.

Browser evidence: local hardened app displayed markup-like source/question text literally and accepted an answer using delegated controls while inline scripts were prohibited. Local benign framing was blocked by browser policy. No production data or quota was used for these tests.

No operator legal/contact details, private contractual settings, incident owner or reviewer acceptance have been invented. Approval status remains HOLD until the original gate’s Critical/High requirements are satisfied with independent decisions.
Deployed staging initially verified release e699e2a552101d499664 at https://studioza-ai-staging.cassidyjames011.workers.dev/: HTTP 200, restrictive CSP, frame denial, nosniff, no-referrer, permissions policy, HSTS and no-store. Two files remained selected in its source carousel. The native no-interests browser confirmation blocked the automation protocol; source now replaces that popup and clear/source confirmations with an accessible in-page dialog. Completing the revised UI test remains necessary after the old native popup is dismissed. Production remained unchanged (root request still returned the old Origin-not-allowed response).

