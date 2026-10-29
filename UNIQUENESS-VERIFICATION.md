# Studioza question uniqueness — implementation and verification

29 October 2026. Feature STZ-QUESTION-UNIQUENESS-01.

## Implementation

The existing document/website generation pipeline now validates every candidate before emitting a batch to the browser. All Theory, Mixed and Practical modes and Short, Medium and Long settings use this pipeline. Existing saved question records and marking remain compatible.

`question-uniqueness.mjs` provides Unicode/text normalisation, SHA-256 fingerprints, token/character-trigram similarity, validated assessment fingerprints, answer/reasoning comparisons, practical method and full ordered-task comparisons, objective coverage and machine-readable rejection reasons. Mathematics and code literals retain meaningful distinctions. A shared topic alone is never grounds for rejection. Model metadata must have valid shape and must agree with actual answer/explanation evidence for deterministic equivalence rejection.

`worker.js` extracts a prioritised plan of at most 24 source-grounded objectives using the existing approved Gemini model. The generation schema constrains the primary learning objective to that plan, and the backend checks membership. Each batch then receives an independent assessment review comparing actual prompts, correct answers, explanations and complete practical task sequences against accepted questions, earlier candidates and recent same-material questions. No embedding endpoint or universal cosine threshold is assumed. Duplicate references and review responses are validated before use. This is a real batched AI comparison, not lexical matching presented as semantic analysis.

Local comparison thresholds: lexical rejection classification at 0.90; objective/action/expected-answer/reasoning fingerprint overlap at 0.82/0.80/0.80/0.80 plus actual answer/explanation overlap at 0.75 and matching cognitive skill. These conservative thresholds govern the structured fallback; independent AI review also examines candidates that do not meet them. Opposing concepts are distinguished. The objective cap is 25% rounded up when the source plan offers at least four objectives; fewer objectives disable this soft coverage cap.

Rejected candidates retain accepted questions and trigger generation of only the missing batch count, with exclusion summaries and rejection reasons. There are at most three replacement attempts and a total candidate budget of ten times the requested count, plus the existing three-stall guard. Replacements go through the same checks. Insufficient material returns the validated partial set. The browser uses its actual count for the sprint and explains the shortfall. Quota/service limits preserve already validated results and receive a distinct explanation.

`index.html` computes a source key from file-content SHA-256 hashes and sorted website URLs. It sends at most the 50 most recent matching questions from the existing browser-local bank. No shared history store, account system, new credentials or cross-user service is introduced. Existing clear-upload-history controls delete generated questions and their new metadata. Old saved tests remain readable; records created before source keys existed are not retroactively included in cross-test exclusions. Website keys identify URLs, not immutable content revisions. Isolation inherits the application's existing browser-local storage boundary; people sharing one browser profile also share its existing bank.

## Failure handling and diagnostics

If semantic review is unavailable or malformed, deterministic fingerprint checks continue and the browser explicitly discloses the limited fallback. Uncertain comparisons are recorded and disclosed rather than rejecting every related topic. This fallback cannot guarantee semantic uniqueness. Cancellation propagates; all additional AI requests use existing quota accounting, approved model, server-held credentials and timeouts. Existing origin, rate-limit and Turnstile checks remain intact.

Count-only Worker diagnostics and the response stream record candidates, accepted questions, rejection categories, regeneration rounds, semantic calls/outages, uncertainty, final count and elapsed validation/total processing time. No question text or source content is added to operational logs.

## Verification

- `node --test question-length.test.cjs uniqueness.test.mjs`: **53 passed, 0 failed**. Includes all nine mode/length combinations, exact/near/semantic/practical cases, opposites, complete long task sequences, misleading metadata, repeated replacements, bounded attempts, insufficient material, history isolation, legacy progress, malformed review references, semantic outage, quota partials, browser script parsing, and input/security boundaries. External AI responses in these automated integration tests are simulated.
- `node uniqueness-evaluation.mjs`: **20 labelled pairs, 10 true positives, 10 true negatives, 0 false positives, 0 false negatives**. Precision and recall are 100% on this controlled structured-fingerprint dataset only. The public synthetic fixtures and evaluation output are committed. This is not a general semantic-model accuracy result or proof of the 95% target on real student material.
- Cloudflare Worker bundle and deployment succeeded using the existing bindings and secrets.
- Two real browser generations from the same public source (`https://ai-2040.com/`), Theory/Medium, three questions each, succeeded. Both displayed the actual 3-question count and completed semantic review without a fallback warning. Manual inspection of all six questions found distinct assessed answers/objectives: policy proposal as communication vehicle; leaders' lesser-evil motivation; risk of internal AI R&D; international transparency/scaling mechanism; power concentration despite alignment; scenario scrutiny exposing hidden flaws. Related topics were retained when they required different answers.
- Live diagnostics for the second run: 3 candidates, 3 accepted, 1 semantic review call, 0 semantic outages, 0 replacement rounds; 7,118 ms validation and 52,797 ms total including source reading/generation. No rejection was needed in this live sample; rejection and replacement paths were exercised in automated tests.
- GitHub Pages returned HTTP 200 and served the new source-history/partial-result frontend.

## Cost and remaining evaluation limits

There is one objective-planning call per run and one semantic review per nonempty eligible batch, in addition to generation/replacement calls. Calls are batched rather than issued per question pair, and all count toward the existing shared daily limit. This increases latency and quota consumption; the measured live sample is illustrative, not a performance guarantee.

Live AI sampling covered Theory/Medium only. All nine combinations were exercised automatically with simulated model responses. The controlled dataset spans computing, business, biology and history, but a larger independently labelled benchmark of real student questions is still needed to establish general 95% precision/recall and calibrate thresholds. Semantic review is probabilistic; fingerprints and reviewer decisions can be wrong. No claim of perfect duplicate detection is made.

## Changed files and deployment

Production: `worker.js`, `question-uniqueness.mjs`, `index.html`. Tests/evidence: `question-length.test.cjs`, `uniqueness.test.mjs`, `uniqueness-evaluation.mjs`, `uniqueness-labelled-pairs.json`, `uniqueness-evaluation-results.json`, this report. No extra services, embedding credentials, shared history database or runtime secrets are required. The frontend remains on GitHub Pages and the backend on the existing Cloudflare Worker.
