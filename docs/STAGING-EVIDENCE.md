# Isolated deployed staging verification — 28 October 2026

Candidate source: PR #1, tested head `3a483e554a1bb2bab86be000ffcf96efabcae246`. Runtime/build release: `f41d2653bb69dd204729`.

All three checks completed successfully: **Security checks**, **Workers Builds: studioza-ai-staging**, and the isolated automatic preview build for **floral-wood-c42bbaa1118-gemini-proxy**. The latter is a preview deployment, not a production rollout.

The staging URL is https://studioza-ai-staging.cassidyjames011.workers.dev/ . It uses a separate Durable Object namespace, Cloudflare's public dummy verification key and synthetic mock answers. It has no production Gemini key. The banner explicitly states that it is a test workspace.

Eight bounded requests were sent to this staging deployment. Five were concurrent valid test-key requests with two synthetic documents and a two-question mixed request. Exactly **3 returned 200 and 2 returned 429**, demonstrating the isolated three-reservation threshold under concurrent calls. Additional requests to an unknown path, missing-token payload and unapproved origin returned **404, 400 and 403** respectively. No real Gemini generation was performed and the production quota was untouched.

Live root headers included restrictive CSP (no inline script/eval, frame-ancestors none), X-Frame-Options DENY, X-Content-Type-Options nosniff, no-referrer, Permissions-Policy, HSTS and no-store. X-Studioza-Release matched the source build. Request IDs were returned. Complete response records are retained in the local remediation evidence pack rather than posting diagnostic request records publicly.

Supporting earlier local Cloudflare-runtime test: 3 successful synthetic generations, 2 rolling-limit rejections, and a later daily-limit rejection after the minute elapsed. A real local SQLite Durable Object was used; this is stronger than a counter mock but is still distinct from production proof.

The browser verified two selected sources in deployed staging. Final interactive Create-flow automation was blocked by an old native browser confirmation. The candidate replaces that confirmation with an accessible in-page dialog, but the revised interactive test must be completed after dismissing the old modal. Dummy verification cannot prove production token replay/expiry or binding behaviour. Actual provider settings, operator/privacy details, independent review, alert/rollback drills and remaining accessibility/model-quality evidence are still required by PILOT-GATE.md.

Production `main` remains at `06f4db4ee642154613a3ab9659d733cbfb33aa0f` until independently reviewed merge. Branch-protection save was prepared but GitHub required fresh email verification; it is not claimed enabled until that verification and a settings check complete. Pilot approval remains **HOLD**.
