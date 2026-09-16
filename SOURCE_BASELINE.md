# Source Baseline

Phase: DB-6B — Document Generation REST API (foundation)
Git source of truth before this phase: `Akash76803/pdfDocGen` main commit `74da75458369dabcc1cf57335ed250bd7d9de81a`.

DB-6A at that commit passed GitHub Code Health: dependency install, typecheck, tests and build.

DB-6B additions in this ZIP are not yet committed to Git. The API transport/contract and generation-service boundary are implemented. Production headless renderer adapter wiring remains pending before DB-6B can be marked COMPLETE.

## DB-6B Fix7 local-first baseline
- Headless Fidelity Bridge implemented on top of DB-6B Fix6.
- Formula fields, self-contained static images, and desktop absolute layout metadata are now carried into headless PDF generation.
- See `README-DB6B-Fix7-Headless-Fidelity-Bridge.md`.

## DB-6B Fix8
- Added DISCOUNT(amount, rate) formula parity to desktop table preview and headless template engine.
- Supports fraction rates (0.20) and whole-percent rates (20).
- User invoice smoke: 1980->1584, 2170->1736, 5620->4496.
