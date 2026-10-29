# Anonymous pilot gate — owner and reviewer decisions required

This change implements mitigations; it **does not approve a student pilot**.

| Required decision/evidence | Current state | Responsible role |
|---|---|---|
| Named operator and private support/privacy/security contact | Awaiting owner details; public issue route is for non-sensitive support only | Product owner |
| Lawful basis, controller/processor allocation, processing record and DPIA threshold | Not supplied; technical tests cannot sign these | Data-protection reviewer |
| Google/Cloudflare contract, transfer, log/content retention and model-training settings | Need provider/account evidence | Operator + data-protection reviewer |
| Branch protection, required CI and independent PR review | Settings/CI and actual approval must be evidenced | Maintainer + independent reviewer |
| Exact deployed versions, secrets-by-name, alert delivery, rollback and recovery drill | Need deployed staging/production evidence | Operator/security reviewer |
| Production token replay/expiry, wrong binding, strict live quota/concurrency | Local tests plus isolated staging are supporting evidence; real token/service evidence still needed | Security reviewer |
| Real question quality: 10 per mode and prompt-injection trial with synthetic facts | Requires an agreed model/budget window; mock answers cannot establish quality | Product/developer reviewer |
| Physical mobile, 200% zoom, NVDA/VoiceOver and degraded-network checks | Need appropriate browser/device/reviewer | Accessibility reviewer |
| Website imports | Paused at both UI and API; no server URL/DNS fetching. Re-enable only with reviewed egress boundary and dedicated tests | Security reviewer |

For each original Critical/High test: attach suitable evidence or a documented, time-bound compensating control and formal acceptance by the required reviewers. Do not relabel blocked tests as Pass because a mock or document exists. Record named owners and accepted due dates; placeholders are not assignments.
