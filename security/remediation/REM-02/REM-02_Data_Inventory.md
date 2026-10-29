# REM-02 — Data Inventory

Review date: 29 October 2026. Source: a2c626ac41ba334933ef31043c2f8c8513f39865 (GitHub main). Candidate only; not deployed. Independent reviewer: Pending.

| Category | Collection / recipient | Storage / retention / deletion |
|---|---|---|
| PDF bytes and embedded metadata | Browser → Worker → Gemini | Tab memory; provider retention requires account confirmation |
| Word/text content | Browser extraction → Worker → Gemini | Source files in tab memory; extracted text transient; Google terms apply |
| Filenames | Browser labels | Candidate replaces transmitted names with Source N for document generation; names inside contents remain |
| Interests, existing questions, prompts, outputs | Browser → Worker → Gemini | Browser app keys; candidate 30-day fixed window checked at page load |
| Progress, answers, accessibility setting, course title | Browser localStorage | Clear-all control; first candidate load clears legacy study keys |
| IP, headers, request timing | GitHub/CDNs/Cloudflare; Worker rate limiter | Provider retention unverified; native rate-limit key uses request IP |
| Daily quota | Cloudflare SQLite Durable Object | Global day/count; old rows removed on subsequent reservation, not time-guaranteed |
| Website URL, content, DNS | Existing Worker website-import path | Candidate rejects imports before provider fetch |
| Security token | Cloudflare Turnstile and Worker verification | Account/provider terms; no token persistence introduced |
| External assets | Tailwind CDN, unpkg, Google Fonts, Turnstile | Browser connection metadata; provider policies require assessment |
