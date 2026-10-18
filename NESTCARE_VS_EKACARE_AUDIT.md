# Nest Care vs Eka Care — Audit & Phase Plan

Date: 2026-10-15
Scope: `NestCare/backend`, `NestCare/frontend` (web), `NestCare/NestCare` (React Native app). Reference flows: `leads-pixelate`, `sports-pixelate`, `hrms`.

> **Note:** Nest Care side = code padh ke verified. Eka Care side = public product knowledge se (live site check nahi hua) — implement karne se pehle unki current feature/pricing page ek baar dekh lena.

---

## 1. Nest Care ki current state (verified)

**Backend (Node/Express/Mongo, multi-tenant)** — sirf 5 resources:

| Resource    | Fields jo abhi hain                                                                                                                                                                                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant      | name, slug, orgType (10 types), ownerUser, plan (trial/basic/pro/enterprise), planExpiresAt (14 din), status, branding{logo,colors,appName}, contact{email,phone,address,timezone,currency,language}, limits{userLimit=5,storageLimit}, activeModules, gstDetails{gstin,legalName} |
| User        | name, email, password, role (11 roles), tenantId, status, phone, phoneVerified, totp*, otp hashes, reset token                                                                                                                                                                     |
| Patient     | name, dob, gender, phone, email, address, bloodGroup, allergies[], emergencyContact{name,phone,relation}, status                                                                                                                                                                   |
| Doctor      | name, specialization, qualification, registrationNumber, department, phone, email, availability[{day,start,end}], status, userId                                                                                                                                                   |
| Appointment | patientId, doctorId, scheduledAt, status (scheduled/completed/cancelled/no_show), reason, notes                                                                                                                                                                                    |

**Auth (leads se port ho chuka):** register-tenant, login, TOTP 2FA, WhatsApp OTP login, phone verify, forgot/reset password (email link), refresh, logout, CSRF, rate limits.

**Web pages (9):** Login, RegisterTenant, ForgotPassword, ResetPassword, Dashboard, Patients, Doctors, Appointments, Settings (+SecuritySettings).
Sidebar mein links jo page-less hain: `/tenants`, `/billing`, `/staff`, `/messages`, `/prescriptions`, `/documents` → **6 dead links**.

**Mobile app (28 screens):** sirf Auth + Doctors + Appointments + Book + Home real API use karte hain. **Baaki 22 screens UI-only / static** (Prescriptions, LabResults, Vitals, Medicine reminder, Insurance, Payments, Chat, VideoCall, AI assistant, Emergency, Timeline, Records, Notifications, Messages, Profile, Settings…) — backend model/route hi nahi hai inke liye.

---

## 2. Feature gap vs Eka Care

Legend: ✅ hai | 🟡 UI hai, backend nahi | ❌ nahi hai

### A. Patient side (Eka Care consumer app)

| Feature                                                          | Eka Care | Nest Care                       |
| ---------------------------------------------------------------- | -------- | ------------------------------- |
| Signup via phone OTP (patient)                                   | ✅       | ❌ (sirf tenant-owner register) |
| ABHA (ABDM health ID) create/link                                | ✅       | ❌                              |
| Health records locker (upload/scan Rx, labs, bills) + auto-parse | ✅       | 🟡                              |
| Records share with doctor / expiring link                        | ✅       | ❌                              |
| Family profiles (ek account, multiple members)                   | ✅       | ❌                              |
| Vitals tracking + charts (BP, sugar, weight…)                    | ✅       | 🟡                              |
| Medicine reminders / adherence                                   | ✅       | 🟡                              |
| Lab test booking + home collection                               | ✅       | ❌                              |
| Online pharmacy / medicine order                                 | ✅       | ❌                              |
| Book appointment / teleconsult (video)                           | ✅       | ✅ booking / 🟡 video           |
| Insurance + bills                                                | ✅       | 🟡                              |
| Health score / insights / AI assistant                           | ✅       | 🟡                              |
| Emergency / SOS contact                                          | partial  | 🟡                              |

### B. Doctor / clinic side (Eka Care EMR)

| Feature                                                         | Eka Care       | Nest Care                                                     |
| --------------------------------------------------------------- | -------------- | ------------------------------------------------------------- |
| Patient registry + search + UHID                                | ✅             | ✅ basic (no UHID, no search/pagination)                      |
| Appointment calendar, slots, walk-in queue/token                | ✅             | 🟡 plain list, koi slot logic nahi, double-booking check nahi |
| E-prescription (drug search, dosage, templates, print/WhatsApp) | ✅             | ❌                                                            |
| Consultation notes / SOAP / history, vitals capture             | ✅             | ❌ (sirf `notes` string)                                      |
| AI scribe (voice → notes)                                       | ✅ (EkaScribe) | ❌                                                            |
| Drug interaction / allergy alert                                | ✅             | ❌ (allergies stored, use nahi)                               |
| Billing / invoice / receipts / GST                              | ✅             | ❌ (gstDetails field hai, billing nahi)                       |
| Lab orders + results                                            | ✅             | ❌                                                            |
| Follow-up reminders (WhatsApp/SMS)                              | ✅             | ❌ (WhatsApp OTP util hai, reminders nahi)                    |
| Staff / roles & permissions                                     | ✅             | 🟡 roles enum hai, **route par enforce nahi**                 |
| Multi-branch / multi-doctor clinic                              | ✅             | ❌                                                            |
| Reports & analytics dashboard                                   | ✅             | 🟡                                                            |
| Patient-facing booking page / clinic profile                    | ✅             | ❌                                                            |
| ABDM (HIP/HIU, consent, care-context)                           | ✅             | ❌                                                            |
| Data export / import (Excel)                                    | ✅             | ❌                                                            |
| Inventory (pharmacy tenants)                                    | partial        | ❌                                                            |

### C. Platform / SaaS

| Feature                                | Leads/Sports/HRMS | Nest Care                                                   |
| -------------------------------------- | ----------------- | ----------------------------------------------------------- |
| Subscription model + Razorpay checkout | ✅                | ❌ (plan field + expiry check, **pay karne ka rasta nahi**) |
| Plan limits enforcement                | ✅                | 🟡 `limits` field hai, kahin check nahi                     |
| Invoices (GST 18%)                     | ✅                | ❌                                                          |
| Offer codes                            | ✅ (sports)       | ❌                                                          |
| Activity/audit log                     | ✅ (leads)        | ❌ — healthcare mein must                                   |
| Super-admin tenants/billing pages      | ✅                | ❌ (nav link only)                                          |

---

## 3. Input variables / parameters gap (field-by-field)

### Registration (tenant) — abhi: `orgName, orgType, ownerName, email, password`

Leads reference: `name, email, password, companyName, phone, department` + confirm-password + trial plan + "Choose Plan" step.

| Param                              | Abhi                                      | Chahiye                                   |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------- |
| phone (owner)                      | ❌                                        | ✅ required — WhatsApp OTP verify ke liye |
| confirmPassword                    | ❌                                        | ✅ (frontend)                             |
| password min                       | 6 (register) vs 8 (reset)                 | 8 + upper/lower/number (sports rule)      |
| email normalize                    | ❌ (`findOne({email})` raw)               | `validator.normalizeEmail` + lowercase    |
| name/org length validation         | ❌                                        | 2–80 / 2–120                              |
| city, state, pincode               | ❌                                        | ✅ (clinic discoverability + GST state)   |
| medical registration no. (council) | doctor model mein hai, register mein nahi | individual_doctor ke liye required        |
| specialities (multi)               | ❌                                        | ✅                                        |
| doctorCount / branchCount          | ❌                                        | ✅ — pricing ka base (per-doctor)         |
| GSTIN (optional)                   | schema mein hai, form mein nahi           | ✅ optional                               |
| terms/consent + DPDP consent       | ❌                                        | ✅                                        |
| referral/offer code                | ❌                                        | ✅ optional                               |

### Patient — add karna hai

`uhid (auto, per-tenant sequence)`, `abhaNumber`, `abhaAddress`, `salutation`, `maritalStatus`, `occupation`, `city/state/pincode`, `govtId type+no`, `guardian/relation (minors)`, `referredBy`, `chronicConditions[]`, `currentMedications[]`, `pastSurgeries[]`, `familyHistory`, `insurance{provider,policyNo,validTill}`, `consent{whatsapp, dataSharing, at}`, `photoUrl`, `tags[]`, `primaryDoctorId`, `familyGroupId`.

### Doctor — add karna hai

`fee (consult), followUpFee, followUpDays`, `slotDurationMins`, `breaks[]`, `onlineConsultEnabled`, `experienceYears`, `languages[]`, `bio`, `photoUrl`, `signatureUrl + stampUrl` (Rx print), `councilName`, `registrationVerified`, `branchId`, `leaveDates[]`.

### Appointment — add karna hai

`type (in_clinic/video/walk_in)`, `slotEnd/duration`, `tokenNo`, `fee, paymentStatus, paymentId`, `checkedInAt, startedAt, completedAt`, `cancelReason, cancelledBy`, `rescheduledFrom`, `videoRoomUrl`, `reminderSentAt`, `source (app/web/reception)`, `consultationId`.

### New collections

`Consultation(vitals, complaints, diagnosis[], notes, followUpOn)`, `Prescription(items[{drug,dose,freq,days,instr}], advice, signed)`, `MedicalRecord(file, type, parsed, sharedWith[])`, `LabOrder/LabResult`, `Invoice/Payment`, `Subscription`, `OfferCode`, `ActivityLog`, `Branch`, `Notification/Reminder`, `Template(Rx/WhatsApp)`.

---

## 4. Existing code mein jo issues mile (fix pehle, features baad mein)

| #   | Severity | Issue                                                                                                                                                                | Kahan                                                       |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | **High** | `update` mein `req.body` seedha pass → body mein `tenantId` bhej ke record doosre tenant mein move ho sakta hai (mass assignment)                                    | `appointmentController.update`, same pattern patient/doctor |
| 2   | **High** | `patientId`/`doctorId` verify nahi hota ki same tenant ke hain → cross-tenant reference                                                                              | `appointmentController.create`                              |
| 3   | **High** | Routes par sirf `protect` — koi role check nahi. `patient`/`staff` role bhi sab patients list/delete kar sakta hai. `authorize` helper auth.js mein hai par use nahi | saare `*Routes.js`                                          |
| 4   | **High** | CORS: `callback(null, true)` dono branch mein → har origin allowed + credentials                                                                                     | `server.js`                                                 |
| 5   | Med      | `refresh` expired token `ignoreExpiration: true` se accept karta hai, koi rotation/revoke nahi (`refreshTokenHash` field unused)                                     | `authController.refresh`                                    |
| 6   | Med      | `updateTenant` `branding`/`contact` poora replace karta hai (timezone/currency overwrite ho jaate hain agar partial bheja)                                           | `tenantController`                                          |
| 7   | Med      | Pagination/search nahi — `find()` poori collection                                                                                                                   | sab `getAll`                                                |
| 8   | Med      | Slug race: `while findOne` loop; leads `_id` suffix use karta hai (collision-free)                                                                                   | `registerTenant`                                            |
| 9   | Med      | Register mein transaction nahi — user ban jaye aur Tenant create fail ho to orphan user                                                                              | `registerTenant`                                            |
| 10  | Low      | 6 dead sidebar links, Doctor/Patient dashboard alag nahi                                                                                                             | `navigation.ts`                                             |
| 11  | Low      | Mobile `API_BASE` hardcoded `10.0.2.2` — env/build config chahiye                                                                                                    | `api.ts`                                                    |

---

## 5. Registration flow — leads/sports/hrms jaisa (copy plan)

**Reference flow (leads):**

1. `POST /auth/register` → validate → User(role super_admin) → Tenant(plan `trial`) → session cookie + token → redirect `/onboarding`.
2. Onboarding / "Create Account & Choose Plan" → `GET /billing/plans` → Razorpay order → verify signature → `Subscription` active + invoice (`INV-LEADS-0001`) + welcome email.
3. Phone verify (WhatsApp OTP) → optional TOTP in Settings.
4. Trial/plan expiry gate in `protect` (Nest Care mein ye already hai).

**Nest Care target flow:**

```
Register (org + owner + phone + doctors count)
  → session + Tenant(plan=trial, 14d)         [already]
  → /onboarding wizard:
       1. Verify phone (WhatsApp OTP)          [sendPhoneOtp already hai]
       2. Clinic profile (address, GSTIN, specialities, timings)
       3. Add first doctor(s) / invite staff
       4. Choose plan → Razorpay → Subscription  [NEW]
  → Dashboard (trial banner "X din bache")
```

Backend delta (files to add, leads se copy-adapt):
`models/Subscription.js`, `models/OfferCode.js`, `routes/billingRoutes.js`, `utils/invoiceTemplate.js`, `utils/emailService.js` (welcome + invoice), plus `/auth/reset-password/otp/*` (leads wala WhatsApp/TOTP reset — Nest Care mein sirf email reset hai).
Frontend delta: `OnboardingPage`, `BillingPage`, `PlanCards`, trial banner, `PaymentSuccessPage`; mobile: `PlanScreen`, Razorpay RN SDK.

---

## 6. Pricing model (market-style subscription)

Sports ka rule follow karo (per-unit, GST 18% upar se, yearly = 12×, offer codes) — healthcare mein unit = **doctor** (clinic software market mein standard seat). Eka Care ka EMR free/low-entry rakhta hai, isliye entry plan sasta rakho.

**Proposal (numbers placeholder — confirm karo):**

| Plan            | Price (per doctor / month, + 18% GST) | Includes                                                                  |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------- |
| Trial           | Free, 14 din                          | 1 doctor, 50 patients, basic Rx                                           |
| Starter         | ₹499                                  | Patients, appointments, e-Rx, records, in-app reminders                   |
| Pro             | ₹899                                  | + WhatsApp reminders/Rx, billing & GST invoices, analytics, video consult |
| Clinic/Hospital | ₹1,499 (min 5 doctors)                | + multi-branch, roles, ABDM, lab/pharmacy, API                            |
| Enterprise      | Custom                                | SLA, on-prem, integrations                                                |

Add-ons (sports ke WhatsApp tier jaisa): WhatsApp pack, AI scribe per consult, extra storage.
Implementation: `utils/pricing.js` — `calculatePricing(doctorCount, tier, offer)` (copy `sports-pixelate/backend/utils/pricing.js`, assert self-check ke saath). `Tenant.limits` ko `PLAN_LIMITS` se bharo aur `protect`/create controllers mein enforce karo.

---

## 7. Phases

**Phase 0 — Hardening (3–4 din)** — pehle ye, warna features unsafe ke upar banenge

- Mass-assignment whitelist (#1), tenant-check on refs (#2), `authorize(roles)` on routes (#3), CORS fix (#4), refresh rotation (#5), transaction/slug fix (#8, #9), pagination+search (#7).
- Backend ke liye ek `check-*.js` self-test (live DB par nahi — models stub).

**Phase 1 — Registration + Subscription (1–1.5 hafta)**

- Register fields (sec. 3), validations, phone OTP step, `/onboarding` wizard.
- Subscription/Razorpay/invoice/offer codes, pricing.js, plan limits, trial banner, expiry gate UX, super-admin Tenants + Billing pages.
- Mobile Register/Plan screens ko web ke saath align.

**Phase 2 — Core clinical (2 hafte)**

- Patient extended fields + UHID + search.
- Doctor fee/slots/leaves; slot-based booking, double-booking guard, walk-in token queue.
- Consultation + Prescription (drug master, templates, PDF/WhatsApp share, allergy alert).
- Staff management page (invite, roles).

**Phase 3 — Patient app real data (1.5 hafte)**

- Patient signup via phone OTP, family profiles.
- Records locker (upload, categories, share link), vitals, medicine reminders, prescriptions/lab screens ko API se jodo (22 static screens → real).
- Push + WhatsApp reminders (appointment, follow-up, medicine).

**Phase 4 — Billing, Lab, Video (2 hafte)**

- Patient invoices/receipts (GST), payments at clinic + online.
- Lab orders/results, pharmacy inventory (pharmacy/diagnostic org types).
- Video consult (Agora/Daily/Jitsi), chat.

**Phase 5 — Compliance & differentiation (2–3 hafte)**

- ABHA create/link + ABDM HIP/HIU (sandbox → production), consent manager.
- Audit log (leads `ActivityLog` port), data export, DPDP consent + retention.
- AI scribe / AI assistant (Claude plans, server-side keys — leads Autopilot pattern), analytics dashboards, multi-branch.

---

## 8. Recommended next step

Phase 0 + Phase 1 saath start karo — security fix chhote hain aur registration/subscription se revenue path khulta hai. Bolo to Phase 0 ka patch pehle bana deta hoon.

---

## 9. Implementation status (2026-10-15)

| Phase                          | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 Hardening                    | Done (mass-assignment, tenant refs, role checks, CORS, refresh, pagination/search, register rollback)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1 Registration + subscription  | Done web + backend + mobile register fields. Pending: onboarding wizard, offer codes, invoice PDF/email, super-admin tenants/billing pages                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2 Core clinical                | Backend done: UHID, extended patient/doctor/appointment fields, slot generation + double-booking guard, walk-in token, check-in, Consultation + Prescription (allergy warning, sign/lock), Staff API. Web: slot picker, doctor schedule/fee, UHID column, Staff page. Consultation/Rx web page with print also done. Pending: WhatsApp share of Rx, mobile slot picker, drug master                                                                                                                                                                                                                                                                                                    |
| 3 Patient app                  | Backend done: patient self-signup into a clinic (clinic code), own + family profiles, patient booking with slots/cancel, signed prescriptions, vitals log, medicine reminders (stored), records locker (<=2MB PDF/JPG/PNG in Mongo). Mobile: patient signup, prescriptions, vitals, reminders, slot-based booking, records list wired to API. Pending: records upload + in-app file viewer, reminder delivery scheduler (push/WhatsApp), share-with-doctor, payments/insurance/lab-booking screens, chat/video                                                                                                                                                                         |
| 4 Billing, lab, video          | Backend: invoices (per-tenant numbering, GST per line, partial payments with atomic overpay guard, void), lab orders (tests, collected/resulted, auto low/high flag), Jitsi video consult with unguessable room + join-time window, patient /me/invoices, /me/lab-orders, video-link. Web: Invoices page (create/pay/print/void), Lab Orders page, Bill + Join video from Appointments. Mobile: Payments + Lab Results real data, Join video consult. Pending: online payment of invoices (needs clinic Razorpay keys), invoice PDF/WhatsApp share, pharmacy inventory, lab PDF reports, in-app video (self-hosted Jitsi/WebRTC)                                                       |
| 5 Compliance & differentiation | Done: append-only audit trail (who viewed/changed which record; no bodies stored) + admin Audit Log page; patient data export, consent log (WhatsApp/data sharing/AI/marketing) and erasure requests (DPDP); ABHA capture with format check (status stays unverified); AI scribe via Claude (opt-in per tenant, server-side key, draft-only, output whitelisted); analytics summary (appointments, no-show, revenue, top doctors, lab) + page; multi-branch Locations with plan cap, doctor/appointment branch links. Not done: real ABDM gateway verification/HIP-HIU (needs NHA registration + sandbox creds), mobile UI for export/consent/ABHA, audit-log retention policy, e-sign |

Offline checks: `backend/scripts/check-register.js`, `check-appointments.js`, `utils/{pick,pricing,slots}.js` (run with node).

---

## 10. Schema migration note (2026-10-15)

Patient and Doctor models were restructured (firstName/lastName/contact/professionalDetails/consultation/medicalSummary, patientId/doctorId, accountStatus). All backend controllers, web pages and mobile screens were aligned. For existing data run once: `node scripts/migrate-patients.js` and `node scripts/migrate-doctors.js` (both idempotent, additive).

## 11. Reports, solo-doctor onboarding, model audit

- **Reports** (`/api/reports/:type`, web **Reports** page, CSV download, print): appointments, new patients, doctor performance, revenue (invoices), outstanding dues, lab orders. Clinical reports: admins + doctors; money reports: admins + billing. CSV cells are neutralised against spreadsheet-formula injection; each report/download is audit-logged.
- **Solo doctor** (orgType individual_doctor): onboarding asks registration no. + council + fee and auto-creates the Doctor profile linked to the owner (DR-0001, always 1 doctor); Staff/Locations hidden in the sidebar.
- **Clinic code**: optional custom code at onboarding (3-40 chars, lowercase/hyphen, reserved words blocked, unique) and changeable via PUT /tenants/me {slug}.
- **Model audit**: `node scripts/audit-models.js` verifies every whitelisted/populated/counter field exists on its model (run it after any schema change).

## 12. Re-audit and gap closure (2026-10-17)

Eka Care column is from public product knowledge, not a live check. Nest Care column is from the code.

**Added in this round**

| Eka Care feature | Nest Care now |
|---|---|
| Follow-up tracking and reminders | Follow-ups page (overdue / today / 7 days / upcoming; not booked / booked / visited), call, WhatsApp reminder, book from the row. Hourly job reminds the day before once WhatsApp is connected |
| Patient history / repeat visit view | Patients page, History button: visits, last visit, next visit or follow-up, amount due, full timeline (appointments, consultations, invoices, lab) |
| Drug interaction alerts | About 45 common high-risk pairs, shown with the allergy warnings on every prescription save (soft alert, never blocks). Not a complete database |
| Bulk import of existing records | Patients page, Import CSV: sample file, loose column names, DD/MM/YYYY dates, duplicates and bad rows skipped and reported, plan limit enforced, IDs reserved atomically |
| WhatsApp reminders and notifications | 10 message templates (confirmed, reminder, cancelled, follow-up, payment received, payment due, prescription ready, lab report ready, video link, birthday). Settings > WhatsApp: master switch, per-message switch, preview, send log |
| Online fee payment into the clinic's own account | Settings > Online Payments (Razorpay, Cashfree, PhonePe, Paytm), pay from dashboard or patient portal, auto-marks appointment and invoice paid |

**WhatsApp status:** the API is not connected. Every send is logged as "not connected" and nothing leaves the server. When the API details arrive, implement `deliver()` and `isConnected()` in `backend/utils/whatsapp.js`; the templates in `backend/utils/whatsappTemplates.js` must also be submitted to Meta under the listed names. Triggers for confirmed, cancelled, payment, prescription and lab-report messages are already wired; the birthday, payment-due and video-link messages have no trigger yet.

**Still missing vs Eka Care**

| Area | Gap |
|---|---|
| ABDM | Only ABHA number capture. No HIP/HIU, consent manager or care-context linking (needs ABDM sandbox onboarding) |
| Patient app | Lab test booking with home collection, online pharmacy orders, records sharing with an expiring link, auto-reading of uploaded reports, health score |
| Patient app (mobile) | Pay fee online, follow-up view, history. Web portal has payment; the React Native app does not yet |
| Clinic | Public clinic page and online booking link, prescription templates, prescription PDF over WhatsApp, voice-to-notes (AI scribe has text input only) |
| Billing | Offer codes, invoice email, super-admin Tenants and Billing pages, stock auto-deduct when a medicine is invoiced, Price list page |
| Platform | Server-side pagination on most lists (filters run in the browser), 2FA step in the mobile login |
