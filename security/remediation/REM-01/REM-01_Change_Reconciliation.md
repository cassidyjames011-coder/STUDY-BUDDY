# Change reconciliation
Keep PR protections: bounded generation contract, strict origin/Turnstile checks, atomic quota, safe errors, local executable assets and hosting controls.
Keep selected staged review changes from studioza-security-review: safe same-origin redirects, HEAD handling, safe binding failures, strict boolean Siteverify success, quota Retry-After, backup validation and cancellation protections. 32 local tests pass.
Keep current main dark-mode source and contrast fix, ported into the candidate asset build.
Resolve index.html conflict in favour of the migration landing page required by the hardened hosting architecture. Main is included as a merge parent when committed.
Defer later unstaged generation batching/resume changes: broad contract and quota implications require separate review. Original candidates remain untouched.
Full candidate inventory, later-candidate comparison, browser retest and independent review remain incomplete. Do not approve production from these results.
