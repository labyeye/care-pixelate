# NestDoc — Model audit, relationships and pharmacy inventory

Status: implemented and tested. Every claim below was checked against the repository; test results at the end are from real runs.

## 1. Architecture before this change

- Express + Mongoose (MongoDB Atlas replica set `atlas-…-shard-0`, MongoDB 8.0 → multi-document transactions are available).
- **Tenant = organisation** (`Tenant.orgType` includes `pharmacy`). Branches are `Clinic` documents (defined in `models/Compliance.js`). No separate pharmacy entity existed, and none was added: a pharmacy is a tenant; an optional `clinicId` on stock documents identifies a branch store (`null` = main store).
- Auth: `protect` → `requirePlan` → `tenantScope` (sets `req.tenantId`) → `pageAccess` → `authorize(roles)`. Audit: `middleware/audit.js` logs method/path/status, never bodies. All reused unchanged.
- Existing pharmacy-ish code: `Medicine` (catalog + a single `stockQty`/`expiryDate`), `Vendor`, `PriceItem`, a stock in/out/set endpoint. No batches, purchase invoices, ledger or dispensing existed.

## 2. Issues found in the existing code

| #   | Issue                                                                                                                                                                                          | Severity | Resolution                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Invoice` "one live invoice per appointment" index used `$ne` in a partial index. MongoDB rejects that, so **the index never existed** in the real DB (verified: not in `invoices.indexes()`). | High     | Rewritten with `$in: [unpaid, partial, paid]`. Pre-flight found 0 duplicates.                                                                                                    |
| 2   | Appointment overlap only blocked an identical start time; 10:00–10:30 and 10:15 could both be booked.                                                                                          | High     | `AppointmentSlotLock` (see §4).                                                                                                                                                  |
| 3   | Legacy `tenantId_1_uhid_1` unique index collided on `null` for every new patient (one patient per tenant).                                                                                     | High     | Dropped (already gone in dev DB); removed the automatic `syncIndexes()` hook so no index is ever dropped implicitly. `migrate-pharmacy.js --apply` drops it where still present. |
| 4   | `PurchaseInvoice` draft of mine had the same `$ne` partial-index mistake — caught by the index-build step of the new tests.                                                                    | —        | Fixed before shipping.                                                                                                                                                           |
| 5   | `Doctor.departmentIds` referenced a `Department` model that did not exist; clinic ids were unchecked.                                                                                          | Medium   | `Department` model + tenant-scoped validation in `doctorController`.                                                                                                             |
| 6   | Consultation sign was read-then-write (two requests could both "sign") and recorded no signer.                                                                                                 | Medium   | Atomic `draft → signed` update + `signedBy`. Duplicate-consultation race returns 409 instead of 500.                                                                             |
| 7   | Prescription items were free text only.                                                                                                                                                        | Medium   | Optional `medicineId` + snapshots (§5).                                                                                                                                          |
| 8   | `Medicine.stockQty` was edited directly: no history, no batches, no expiry per lot.                                                                                                            | High     | Derived summary; real stock lives in batches + ledger (§3).                                                                                                                      |
| 9   | Medicine/vendor could be deleted while stock history / purchases pointed at them.                                                                                                              | Medium   | Deletion refused (409) → mark inactive.                                                                                                                                          |
| 10  | `User.email` regex only accepted 2–3 character TLDs (`doc@clinic.health` was rejected).                                                                                                        | Low      | Loosened to a normal email shape.                                                                                                                                                |
| 11  | `AuditLog` is append-only by convention (no routes) but not enforced by the model.                                                                                                             | Info     | Not changed: `seed-full.js --remove` deletes its own sample audit rows. Recommend model-level hooks once seeding is retired.                                                     |
| 12  | `Subscription.tenant` is `unique` (one per tenant) — correct. `Tenant.limits` is enforced by `assertWithinLimit`.                                                                              | OK       | No change; pharmacy is **not** plan-gated (no entitlement field exists — decision needed, see §10).                                                                              |

## 3. Inventory model

```
Vendor ──< PurchaseInvoice (draft → received) ──< MedicineBatch >── Medicine
                                                       │
                                                       └──< StockTransaction (append-only ledger)
Consultation(signed Rx) ──(optional link)── PharmacySale ──> MedicineBatch allocations ──> StockTransaction
PharmacySale ──> Invoice (patient sales, item.source.kind = "pharmacy_sale")
```

- `Medicine` stays the catalogue. `stockQty` and `expiryDate` are now a **derived summary** = `legacyStockQty` + sellable batch stock, recomputed by `utils/inventory.syncMedicine`. `legacyStockQty` holds stock that existed before batches and has no lot data; it is carried over automatically and **never converted into an invented batch**. Staff reconcile it with `POST /api/inventory/medicines/:id/reconcile` when they have the real batch number / expiry.
- `MedicineBatch`: per medicine, per location, unique on `(tenantId, clinicId, medicineId, batchNumber)`; same lot number with another expiry is rejected. `quarantined` lots are skipped by FEFO.
- `PurchaseInvoice`: creating it never touches stock. `POST /:id/receive` flips `draft → received` (the idempotency gate) and creates/tops up batches + ledger rows inside one transaction. Received invoices are immutable; corrections are `return` (supplier return) or compensating adjustments. Totals, GST breakdown and rounding are computed on the server.
- `StockTransaction`: one row per quantity change with before/after, reference, actor, optional idempotency key. Update/delete operations are refused by the model. `GET /api/inventory/reconciliation` proves ledger net == batch quantity.
- `PharmacySale`: dispensing is separate from prescribing — signing a prescription never moves stock. FEFO allocation across batches (or a manager-picked batch), price/name snapshots, the exact batches used, unique `(tenantId, idempotencyKey)` so retries replay the original sale, optimistic `returnSeq` so two returns can't both pass. Patient sales create an `Invoice` whose lines point back at the sale; counter sales keep payments on the sale. Prescription-only and schedule H1/X/Narcotic/NDPS medicines require a signed prescription that lists them (quantity-capped when the item has a quantity); scheduled ones also need a named patient.
- Transactions: `utils/txn.withTxn` uses a session when the topology supports it (Atlas does) and falls back to conditional atomic updates + compensation on a standalone mongod. All stock changes are `$gte`-guarded conditional updates, so stock cannot go negative even without a transaction.

## 4. Appointment overlap strategy

`AppointmentSlotLock` stores one row per 5-minute grain per live scheduled appointment, with a unique `(doctorId, grain)` index. Booking inserts the grains (all-or-nothing, partial inserts are removed); any overlap → HTTP 409. Reschedule claims the new window before releasing the old; cancel / complete / no-show / delete release it. Walk-ins are queue entries (token numbers) and hold no slot. Works without transactions. Existing bookings need the one-off backfill in `migrate-pharmacy.js --apply`.

## 5. Other model changes

- `Consultation.prescription.items[]`: + `medicineId?`, `genericName`, `strength`, `dosageForm`, `route`, `quantity` (kept `drug`, `dose`, `frequency`, `days`, `instructions`; `days` is the duration). Items get an `_id`. Server verifies the medicine belongs to the tenant and snapshots name/strength/form. Old items stay valid; drugs outside the catalogue stay valid. + `Consultation.signedBy`.
- `MedicineReminder`: + optional `medicineId`, `consultationId`, `prescriptionItemId`, `frequency`, `timezone`, `createdBy` (validated against tenant + patient). Reminders are never auto-created from prescriptions.
- `LabTest` (new catalogue) and optional `LabOrder.tests[].testId/code/specimenType` (order keeps its own name/unit/range snapshot).
- `Department` (new). `Doctor.departmentIds` now validated; working hours validated (HH:mm, start<end, no overlap per day).
- `Invoice` line `source.kind` + `"pharmacy_sale"`. `PriceItem` + optional `medicineId` / `labTestId`.
- `Tenant.counters` + `purchase`, `pharmacySale`, `department`, `labTest`.

## 6. Indexes added (and why)

| Collection           | Index                                                                                                                         | Reason                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| medicinebatches      | unique `(tenantId, clinicId, medicineId, batchNumber)`                                                                        | one lot per medicine per store              |
|                      | `(tenantId, medicineId, clinicId, expiryDate, quantityAvailable)`                                                             | FEFO pick                                   |
|                      | `(tenantId, expiryDate)`, `(tenantId, purchaseInvoiceId)`                                                                     | expiry sweeps, receipt lookup               |
| stocktransactions    | `(tenantId, medicineId, occurredAt)`, `(tenantId, medicineBatchId, occurredAt)`, `(tenantId, referenceType, referenceId)`     | history, per-batch ledger, source lookup    |
|                      | unique partial `(tenantId, idempotencyKey)`                                                                                   | retry safety                                |
| purchaseinvoices     | unique `(tenantId, number)`; unique partial `(tenantId, vendorId, invoiceNumber)` for draft/received                          | internal number; vendor invoice booked once |
|                      | `(tenantId, invoiceDate)`, `(tenantId, status, paymentStatus)`                                                                | lists                                       |
| pharmacysales        | unique `(tenantId, number)`, unique `(tenantId, idempotencyKey)`; `(tenantId, patientId, createdAt)`, `(tenantId, createdAt)` | numbering, replay, history                  |
| appointmentslotlocks | unique `(doctorId, grain)`, `(appointmentId)`                                                                                 | overlap guard, release                      |
| departments          | unique `(tenantId, departmentId)`, `(tenantId, clinicId, nameKey)`                                                            | ids, no duplicate names per branch          |
| labtests             | unique `(tenantId, testId)`, `(tenantId, nameKey)`, partial `(tenantId, code)`                                                | catalogue                                   |
| medicines            | partial unique `(tenantId, barcode)`, `(tenantId, sku)` (only when non-empty); `(tenantId, genericName)`                      | product identity, search                    |
| invoices             | partial unique `(tenantId, appointmentId)` over live statuses                                                                 | fixes issue #1                              |

Pre-flight on the dev DB: 0 barcode/SKU duplicates, 0 duplicate live invoices per appointment, 0 slot overlaps among the 13 live bookings.

## 7. Migrations / backfills

`node scripts/migrate-pharmacy.js` (dry run) → `--apply`. Idempotent, never deletes documents or drops collections, never runs `syncIndexes`:

1. `legacyStockQty = stockQty` for medicines that lack the field (also done lazily on first touch, so skipping the script cannot lose stock).
2. Slot-lock backfill for live scheduled appointments; any pre-existing overlap is **reported, not altered**.
3. Duplicate pre-flight for the new unique indexes.
4. Drops the obsolete `tenantId_1_uhid_1` patient index if present.

Dev DB dry run: 40 medicines to migrate (38 with stock), 13 live bookings to lock. **It was not applied** — apply it deliberately (see §10).

Rollback: the migration only adds fields/rows. To undo: stop using the new routes; `legacyStockQty` can be ignored (old code reads `stockQty`, which remains correct); delete slot locks with `db.appointmentslotlocks.deleteMany({})`. No data is lost either way.

## 8. API

New (all tenant-scoped, role-checked, audit-logged):
`/api/purchases` (list/create/update-draft, `POST /:id/receive`, `/cancel`, `/payments`, `/return`) · `/api/inventory` (`GET /batches`, `/ledger`, `/reconciliation`; `POST /batches/:id/adjust`, `/batches/:id/hold`, `/medicines/:id/reconcile`, `/medicines/:id/legacy`, `/expire-sweep`) · `/api/pharmacy/sales` (list/get/create, `POST /:id/return` incl. `cancel:true`) · `/api/departments` · `/api/lab-tests`.
Changed behaviour (response shapes unchanged): `POST /api/medicines/:id/stock` now writes through the ledger (needs whole-number qty); `DELETE` medicine/vendor refuse when history exists; appointment create/update can return 409 on overlap; prescription items accept the new optional fields.

Roles: managers = admins + pharmacist. Increasing stock manually, un-batched corrections, expiry write-off and reconciliation reports are admin-only.

## 9. Tests (actually executed)

`cd backend && npm test` → `audit-models` (schema/whitelist consistency) + `test-pharmacy.js` (20 integration tests on an in-memory replica set, indexes built for real) + `smoke-http.js` (real Express app, cookies/CSRF/permissions/audit).
Result of the last run: **audit OK · 20/20 passed · smoke ok**. The 11 existing offline checks (`npm run test:offline`) also pass. Covered: server-side totals, expired/negative/duplicate rejection, cross-tenant refusal, receive-once under a race, FEFO, rollback on shortage, concurrent overselling, idempotent retries, ledger reconciliation and immutability, prescription rules, atomic signing, returns (double-return race), cancel + invoice void, adjustment authorisation, legacy-stock carry-over, tenant isolation, overlap under a race, department/doctor validation.

Not covered by automated tests: the React frontend (no UI was built for purchases/batches/sales yet), load/performance, and Atlas-specific behaviour (tests use an in-memory replica set).

## 10. Open decisions / not done

1. **Apply the migration** on your real DB when ready (`--apply`), then restart the API once so Mongoose builds the new indexes (non-destructive).
2. **No frontend for purchases, batches, dispensing or the ledger** — the Medicines page keeps working through the compatible stock endpoint. Say the word and I'll build the pages.
3. Plan gating for the pharmacy module — no entitlement field exists; currently available on every plan.
4. Schedule-drug rules use `scheduleCategory` text matching `H1/X/Narcotic/NDPS`; confirm the categories you want treated as strict.
5. Batch-specific selling prices are honoured only when a manager picks the batch; otherwise the catalogue price applies.
6. Vendor bank details are still stored on `Vendor` (existing field); they are not exposed in new endpoints — decide whether to drop or encrypt them.
7. `AuditLog` model-level immutability (see issue #11).

## 11. Commands

```
cd NestCare/backend
npm install
npm start                      # API on :5050
npm test                       # audit + integration + HTTP smoke (in-memory DB, never your real one)
npm run test:offline           # the stubbed unit checks
npm run migrate:pharmacy       # dry run;  node scripts/migrate-pharmacy.js --apply
```

Environment: no new variables. New devDependency: `mongodb-memory-server` (tests download a mongod binary on first run).
