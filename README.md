# MFS Wallet QA – Playwright Automation Suite

[![QA Tests](https://github.com/adnanasif12/mfs-wallet-qa/actions/workflows/playwright.yml/badge.svg)](https://github.com/adnanasif12/mfs-wallet-qa/actions/workflows/playwright.yml)

End-to-end QA automation for a mock **Mobile Financial Service (MFS)** wallet, similar in flow to bKash / Nagad:
login, Cash In, Send Money, Cash Out and transaction history.

I built the small app as the **system under test** so the suite can cover the full stack, from UI to API to the database ledger, and run on every push in **GitHub Actions**.

| Layer | What is tested | Tool |
|---|---|---|
| UI | Login, Send Money, Cash Out, history, logout, on desktop Chrome and a mobile viewport (Pixel 7) | Playwright + Page Object Model |
| API | REST endpoints: status codes, error bodies, auth, roles, limits, fees | Playwright `request` |
| Database | Double-entry ledger integrity, money conservation, atomic rollback | SQL on SQLite |
| CI | Smoke tests first, then the full suite on every push and PR; HTML report and failure traces uploaded | GitHub Actions |

**91 automated tests** (69 API/DB + 11 UI × 2 devices), all running in about 40 seconds.

## Test design techniques used

- **Boundary Value Analysis**: min/max limits for every transaction type (`9.99 / 10 / 10.01`, `24,999.99 / 25,000 / 25,000.01`), the free-fee threshold (`100 / 100.01`) and balance edges (`4,909.18` + fee = exactly `5,000.00`, and one paisa more is rejected).
- **Equivalence Partitioning**: invalid phone classes (short, long, wrong prefix, letters, empty, wrong type), invalid amounts (0, negative, string, null, 3 decimals).
- **Negative & security testing**: wrong PIN, PIN lockout after 3 attempts, forged and logged-out tokens, role checks (agent vs customer), no user enumeration, PINs never exposed, malformed JSON returns 400 not 500.
- **Data integrity (SQL)**: every transaction's debits equal credits, no orphan ledger rows, total system money is conserved, fee account equals total fees, no negative balances.
- **Responsive / cross-device**: every UI test runs on desktop Chrome and a Pixel 7 viewport, including a no-horizontal-scroll check.
- **Data-driven tests**: limit and fee tables generate test cases automatically.

## Bugs

- [BUG-002](docs/bug-reports/BUG-002.md): on mobile the dashboard scrolled sideways once the transaction table had a row. Found during an exploratory check of a mobile screenshot, fixed, and covered by regression test `TC-UI-11` (verified to fail before the fix).
- [BUG-001](docs/bug-reports/BUG-001.md): Send Money rejects exactly 25,000 BDT (off-by-one at the upper boundary). The BVA test caught it. It is a seeded defect, kept to show the boundary test and the bug-report format. The test is marked `test.fail()` so CI stays green while the bug is open, and it will flag itself once the bug is fixed.

## Project structure

```
app/                      System under test (Express + SQLite)
  server.js               REST API and business rules
  db.js                   Schema, double-entry ledger, seed data
  public/                 Login and dashboard UI
tests/
  api/                    API tests (auth, send money, cash in/out)
  db/                     SQL ledger-integrity tests
  ui/                     UI tests (desktop + mobile)
  pages/                  Page Objects (LoginPage, DashboardPage)
  support/                Fixtures, API client, test data
docs/
  BUSINESS_RULES.md       Requirements with traceability to test case IDs
  bug-reports/            Defect reports
.github/workflows/        CI pipeline
```

## Run it locally

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`).

```bash
npm install
npx playwright install chromium

npm test               # everything
npm run test:smoke     # @smoke tagged tests only
npm run test:api
npm run test:db
npm run test:ui
npm run report         # open the HTML report
```

To try the app by hand: `npm start`, then open http://localhost:3000.
Demo logins: customer `01711111111` / `1234`, customer `01822222222` / `5678`, agent `01933333333` / `1111`.

Each test resets the database to the seed data, so tests are independent and can run in any order.

## Business rules

See [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md). Each rule maps to the test case IDs (`TC-SM-02`, `TC-DB-04`, ...) that cover it.

---
Author: **Md. Adnan Asif**, QA Engineer · [LinkedIn](https://linkedin.com/in/ashibadnan42)
