# NestDoc — Cybersecurity, Bug, Dead-code & Performance Audit

Scope: `backend/` (Express + Mongoose, multi-tenant), `frontend/` (React/Vite, web + patient portal + designers). The React-Native app (`NestCare/NestCare`) was only checked for how it uses the auth endpoints.
Method: manual review of the auth, billing, payment, portal, upload and print paths; route-guard map; tenant-scoping scan of every controller query; ESLint / tsc / orphan / N+1 scans; `npm audit`; offline proof tests (stubbed models) **plus the existing end-to-end smoke test, which runs the real app against an in-memory MongoDB — no live system and no live database was touched**. Pre-change snapshot: `scratchpad/backups/nestcare-pre-audit.tgz`. Nothing was committed.

## 1. Summary

NestDoc is the best-built of the four: every data route sits behind `protect → requirePlan → tenantScope → authorize/pageAccess`, controllers filter by `req.tenantId`, searches are regex-escaped, request bodies are whitelisted with `pick()`, payments are re-verified with the gateway and are idempotent, and the audit log never stores bodies. The tenant-isolation scan (54 candidate queries) found **no cross-tenant read or write**. The gaps are in the session / OTP layer, which was copied from the same design as the other apps.

| Area | Findings | Fixed now | Left (needs your decision) |
|---|---|---|---|
| Security | 9 | 9 | 0 |
| Bugs | 3 | 3 | 0 |
| Dead / extra code | 4 | 3 | 1 |
| Performance | 4 | 3 | 1 |

## 2. Security findings

| ID | Sev | Finding | Status |
|---|---|---|---|
| N-S1 | High | **Login-by-OTP can be brute-forced and bypasses 2FA.** The 6-digit WhatsApp code (10 minutes) had no attempt budget — only a per-IP limiter (10 / 15 min), which a distributed attacker sidesteps — and it is issued to **every** account on that number, including verified staff and owners. A correct code logs in directly ("the OTP is the second factor; TOTP isn't asked"). Codes were stored as unsalted SHA-256 (10⁶ values ⇒ reversible offline in milliseconds). | Fixed — 5 wrong guesses burn the code; codes are HMAC-keyed with the server secret and compared in constant time (phone-verification OTP too) |
| N-S2 | High | **No session revocation, and the "refresh" never expires.** A password change/reset did nothing to existing tokens (`staffController.resetPassword` even claims "signs the person out everywhere" but only cleared a `refreshTokenHash` that nothing reads). `/auth/refresh` re-issued a token for any access cookie that expired up to **1 hour** ago — so a stolen cookie could be refreshed indefinitely. | Fixed — `tokenVersion` (bumped by the `User` pre-save hook on every password write: reset link, admin reset, …) is in every token and checked by `protect` and by `refresh`; `refresh` also stops after an absolute `SESSION_MAX_HOURS` (default 24) measured from the original login (`ssa` claim); HS256 pinned; purpose-bound tokens refused |
| N-S3 | High | **Re-running authenticator setup silently turned 2FA off.** `POST /auth/2fa/totp/setup` overwrote the secret and set `totpEnabled:false` with no code — a stolen session could strip 2FA, then enrol its own authenticator, defeating "disable needs a current code". | Fixed — setup is refused (409) while an authenticator is enabled |
| N-S4 | Med | No per-account lockout (only 50 failures / 15 min / IP); unknown e-mail answered faster than a wrong password; the 2FA code step had no per-account budget. | Fixed — 10 failures (password or authenticator code) ⇒ 15-min lock; dummy bcrypt compare; non-string e-mail rejected |
| N-S5 | Med | Password reset accepted any 8-character password, while sign-up and staff creation require upper + lower + digit. | Fixed |
| N-S6 | Med | `POST /auth/register-tenant` had no rate limit (the global auth limiter only counts failures) ⇒ unlimited organisation/trial creation. | Fixed — `sensitiveLimiter` |
| N-S7 | Med | Print / PDF windows (invoice, receipt, prescription, report, consultation sheet, subscription invoice) had no CSP, and the report window used an inline `<script>`: one unescaped field would give script access to the same-origin page. Values are escaped, so this is defence in depth. | Fixed — `lib/printWindow.ts` injects `script-src 'none'`; printing is driven by the opener |
| N-S8 | Low | Patient-portal record upload trusted the client-declared MIME (`application/pdf`, JPEG, PNG) without looking at the bytes. | Fixed — magic-byte check |
| N-S9 | Low | `npm audit`: frontend 16 (7 moderate, 9 high), backend dev-tooling items. | Frontend to 11, backend to 3 (dev only) — see §5 |

Checked and found sound (no change): tenant isolation in every controller; doctor / patient scoping (`doctorScope`, `ownedProfile`); CSRF double-submit; Razorpay signature compared in constant time and replay-safe in `/billing/verify`; appointment payments re-confirmed with the gateway and flipped to paid exactly once; photo endpoint (data-URL whitelist, `nosniff`, `default-src 'none'`); audit middleware; CORS (strict list, credentials only for it); no hard-coded secrets; `.env` ignored.

## 3. Bugs

| ID | Finding | Status |
|---|---|---|
| N-B1 | **Money taken but plan not activated.** `/billing/order` overwrote the single `pendingOrder` on every click; paying order A after clicking "Pay" again (second tab, retry) failed with "No matching pending order" although Razorpay had charged the customer. | Fixed — the order carries `{tenantId, plan, doctors, billingCycle}` as Razorpay notes; if the pending order was replaced, `/verify` rebuilds the purchase from the order Razorpay holds (signature already proven), re-prices it server-side, and checks tenant and amount |
| N-B2 | Subscription invoice numbers were `count of paid invoices + 1` over **every tenant's** subscriptions — two simultaneous payments could share a number, and each verify scanned the whole collection. | Fixed — atomic counter (`models/Counter.js`, seeded from the current count) |
| N-B3 | Stale `refreshTokenHash` field / code path (never read). | Removed |

## 4. Dead code, performance

| ID | Finding | Status |
|---|---|---|
| N-D1 | 5 unused npm packages (`react-hook-form`, `@hookform/resolvers`, `zod`, `@radix-ui/react-select`, `@radix-ui/react-dropdown-menu`) | Removed |
| N-D2 | Unused imports across pages (ESLint autofix); `tsc --noUnusedLocals` 19 → 5 | Removed |
| N-D3 | `._.DS_Store` junk files in the project roots | Removed |
| N-D4 | 5 unused locals; 13 exported-but-unreferenced helpers (used only by their own tests) | Left |
| N-P1 | Entry bundle **3,347 kB** (32 pages eager) | Fixed — `React.lazy` per route: **327 kB** (gzip 103 kB) |
| N-P2 | No response compression | Fixed — `compression` (new dependency) |
| N-P3 | Subscription invoice number scan | Fixed (N-B2) |
| N-P4 | 22 `find()` without `.limit()` — all are bounded by an `$in` list or a per-tenant master list (departments, clinics, batches); 6 awaits in loops (reminder job, inventory reports) | Left — fine at this size, revisit past ~10k rows per tenant |

## 5. Remediation log — applied 2026-10-17

### Verification (re-runnable, offline)

| Check | Result |
|---|---|
| `node scripts/check-hardening.js` (new) | stale / purpose / foreign tokens refused by `protect`; 10th wrong password locks, locked account refused with the right password; non-string e-mail refused; 5th wrong OTP burns the code, right code logs in and the token carries `tv`; authenticator setup refused while enabled; refresh refuses stale `tv`, sessions older than the ceiling and tokens without a session start — **passed** |
| existing 13 `scripts/check-*.js` + `audit-models.js` | all pass (the `npm run test:offline` loop is bash-only; run the files individually on Windows) |
| `node scripts/smoke-http.js` — real Express app, cookies + CSRF + permissions + audit, in-memory MongoDB | **smoke ok** |
| load test: `require` of every controller / route / middleware / service / util / model | 0 failures |
| `tsc -p tsconfig.app.json` | 0 errors |
| `vite build` | ok; entry chunk 3,347 kB → 327 kB |
| `npm audit` | backend 3 left (dev tooling only), frontend 16 → 11 |

### Phase 1 — authentication & sessions
N-S1 (HMAC OTP + attempt budget), N-S2 (`tokenVersion`, session ceiling, `purpose`/algorithm checks), N-S3, N-S4, N-S5, N-S6.

### Phase 2 — exposure & input
N-S7 (print CSP), N-S8 (portal upload magic bytes).

### Phase 3 — billing
N-B1, N-B2.

### Phase 4 — dependencies ✅ (partly)
`npm audit fix` (no `--force`). **Left:** `nodemon`, `braces`, `chokidar` (backend dev tooling) and the frontend build toolchain (`tailwindcss`, `vite`, `fast-glob`, `micromatch`) — build-time only, not shipped. The fixes need major upgrades (`vite`, `tailwindcss`) — plan them with a regression pass of the designers.

### Phase 5–7 — bugs, dead code, performance
As listed in §3–§4.

### Rollout notes
1. **Everyone signs in once more after deploy**: tokens issued before this change carry no session-start claim, so `/auth/refresh` rejects them (access tokens last 15 minutes anyway).
2. OTP codes issued before the deploy stop working (they were hashed the old way; they live 10 minutes).
3. `SESSION_MAX_HOURS` (default 24) is the longest a login can be silently extended; raise it if clinics want longer shifts without re-login.
4. New collection `counters` (created on first use, seeded from the current paid-invoice count) and new `User` fields (`tokenVersion`, `failedLogins`, `lockUntil`, `*OtpTries`) — no migration. Run `npm install` in `backend/` (adds `compression`) and `frontend/` (removed packages).
5. A patient or staff member who changes their password is signed out on every device. (There is no in-app "change password" screen today — only reset by link or owner reset — so the web session of the person who just reset is cleared as before.)
6. The repo already had 300 uncommitted changes before this audit; review `git diff` per file when committing.
