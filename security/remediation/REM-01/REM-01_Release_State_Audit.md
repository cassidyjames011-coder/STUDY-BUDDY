# REM-01 Release State Audit
Observed 2026-10-29. Investigation remains in progress.

| Component | Observed state | Verification |
|---|---|---|
| main | a2c626ac41ba334933ef31043c2f8c8513f39865 | Fresh clone |
| PR 1 | Open; head 148555b90519a2cd8447bf1960d936753c9ee548; conflicts with main | GitHub connector |
| Production Worker | Active version displayed as f2582d71, 100% traffic; linked to main a2c626a | Cloudflare dashboard; full UUID pending |
| Pages | Actual served byte comparison pending | Not verified |
| Local remediation | Dirty checkout based on 06f4db4; preserved in place | git status |
| Local review | Dirty checkout based on PR head; staged review fixes and later unstaged generation changes | git status and diffs |
| Candidate | security/rem-01-release-reconciliation | Local branch; not deployed |
| Quota | DAILY_QUOTA / DailyQuota; production object name global-daily-quota; staging uses release-specific object names | Source only; provider namespace ID pending |

Release drift is confirmed. No independent approval exists in this evidence package.
