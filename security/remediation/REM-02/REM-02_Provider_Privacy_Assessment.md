# REM-02 — Provider Privacy Assessment

Review date: 29 October 2026. Source: a2c626ac41ba334933ef31043c2f8c8513f39865 (GitHub main). Candidate only; not deployed. Independent reviewer: Pending.

Exact AI endpoint: generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent, using x-goog-api-key. This is Gemini Developer API, not evidence of Vertex AI or consumer Gemini.

[Gemini terms](https://ai.google.dev/gemini-api/terms), effective 23 March 2026: paid-service treatment depends on active linked billing; EEA/UK/Swiss client availability requires Paid Services. Regional data-use provisions also apply; do not infer actual billing from geography. [Abuse monitoring](https://ai.google.dev/gemini-api/docs/usage-policies) describes 55-day prompt/context/output retention and authorised review. [Optional logs/sharing](https://ai.google.dev/gemini-api/docs/logs-policy) must be checked in the actual project. These public descriptions are not account verification.

[Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) v6.4 effective 3 April 2026: confirm customer, applicable agreement, SCC module and subprocessors. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) documents plan-dependent 3/7-day retention; actual Workers Logs, Logpush, tails, security events, exports and storage settings are unverified. Do not treat this as universal Cloudflare retention.

[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) logs visitor IP for security. Applicable retention and contractual role need confirmation. Tailwind CDN, unpkg and Google Fonts remain additional recipients; self-hosting belongs with the existing REM-01 candidate and is not claimed completed here.

Owner evidence needed: Gemini project/billing linkage without secrets, sharing/logging state, accepted DPA and subprocessors; Cloudflare Worker deployed version, bindings, observability/exports/retention, account agreement and geographic controls. No production account was inspected in this execution.
