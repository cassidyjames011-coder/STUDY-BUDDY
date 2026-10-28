# Studioza

Focused study sprints from documents and interests. Anonymous preview; student-pilot approval remains pending independent security/data-protection review.

Cloudflare deployment target: [Studioza](https://studioza.cassidyjames011.workers.dev/). The GitHub Pages address becomes a migration/backup landing page only after release.

Node 24 and pnpm 11.25.0: `pnpm install --frozen-lockfile --ignore-scripts`, then `pnpm check`. All deployment/build dependencies are pinned in the lockfile. CI checks the source build against committed assets and runs security tests and an advisory audit.

See [operations and rollback](docs/OPERATIONS.md), [remaining pilot gates](docs/PILOT-GATE.md), and [security reporting](SECURITY.md). Never add provider keys or production uploads to this repository. Website ingestion is paused at the API boundary pending a reviewed network-egress design.
