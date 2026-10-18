# Nest Care — Third-party API Requirements

Date: 2026-10-15
Basis: `NESTCARE_VS_EKACARE_AUDIT.md` phases + `backend/` env vars/package.json (verified from code).

> Provider pricing/limits/approval timelines public knowledge se hain — signup se pehle current docs check karo.

---

## 1. Already wired (kuch naya nahi chahiye)

| API                                  | Env vars                                                                                                            | Use abhi                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Razorpay                             | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`                                                                            | Subscription checkout (billingRoutes) |
| SMTP (nodemailer)                    | `SMTP_HOST/PORT/SECURE/USER/PASS`                                                                                   | Forgot/reset password email           |
| WhatsApp Cloud API (platform number) | `WHATSAPP_PLATFORM_PHONE_NUMBER_ID`, `WHATSAPP_PLATFORM_ACCESS_TOKEN`, `WHATSAPP_OTP_TEMPLATE_NAME/LANG/HAS_BUTTON` | Login/phone-verify OTP                |

---

## 2. Chahiye — priority order

### P1 — Phase 1/2 complete karne ke liye (abhi lo)

| #   | API                                                | Kyun                                                                                        | Kya lena hai                                                                                                                                               | Notes                                                                                                                                                                            |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **WhatsApp Cloud API — extra templates**           | Appointment reminder, follow-up, Rx share (PDF), invoice share                              | Meta Business verification (agar nahi hui), naye templates approve: `appointment_reminder`, `followup_reminder`, `prescription_document` (Document header) | Leads ka rule same: 24h window ke bahar sirf approved template; Rx PDF ke liye Document-header template. Tenant ka apna number chahiye to leads Document Vault pattern port karo |
| 2   | **File storage** (S3 / Cloudflare R2 / Cloudinary) | Doctor signature+stamp (Rx print), patient photo, medical records locker, lab report upload | Bucket + access key; signed-URL (expiring)                                                                                                                 | Healthcare data → private bucket, public URL kabhi nahi. R2 sasta (no egress fee)                                                                                                |
| 3   | **Razorpay — Webhooks + Payment Links**            | Online fee payment at booking, clinic invoice pay-link, failed-payment reconcile            | Same keys + `RAZORPAY_WEBHOOK_SECRET`                                                                                                                      | Subscriptions product zaroori nahi; abhi Orders+verify chal raha hai. Payment Link WhatsApp pe bhej sakte ho                                                                     |
| 4   | **Email deliverability** (Amazon SES / Resend)     | Invoice + welcome mail spam mein na jaye                                                    | API key + verified domain (SPF/DKIM)                                                                                                                       | SMTP chal raha hai; sirf volume badhne par                                                                                                                                       |

### P2 — Phase 3/4 (patient app + video + lab)

| #   | API                                                                           | Kyun                                                                                    | Kya lena hai                                                                                                         | Notes                                                                                               |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 5   | **Push notifications — Firebase Cloud Messaging** (+ APNs key iOS)            | Medicine reminder, appointment alert, new Rx                                            | Firebase project, `google-services.json`, `GoogleService-Info.plist`, service-account JSON server ke liye            | RN: `@react-native-firebase/messaging`                                                              |
| 6   | **Video consult** — Daily.co / Agora / Jitsi (8x8 JaaS)                       | VideoCall screen + teleconsult                                                          | API key + room-token endpoint                                                                                        | Quick start: Daily ya Jitsi (free tier). India latency + recording chahiye to Agora                 |
| 7   | **SMS gateway** — MSG91 / Twilio / Gupshup                                    | WhatsApp fail hone par fallback OTP/reminder; patients jinke paas WhatsApp consent nahi | Auth key + **DLT registration** (entity, sender ID, templates)                                                       | India mein DLT ke bina SMS deliver nahi hota — approval mein din lagte hain, jaldi shuru karo       |
| 8   | **Speech-to-text** — Deepgram / Google STT / Sarvam (Hindi-English)           | AI scribe (voice → notes)                                                               | API key                                                                                                              | Hinglish consults ke liye Indic-capable model dekho                                                 |
| 9   | **Claude API** (Anthropic)                                                    | AI scribe structuring, AI assistant, record parsing                                     | `ANTHROPIC_API_KEY` server-side only                                                                                 | Leads Autopilot pattern: key server pe, client ko kabhi nahi. PHI bhejne se pehle DPA/consent check |
| 10  | **Drug master / interactions**                                                | Rx drug search, interaction + allergy alert                                             | Koi single free India API nahi. Options: CSV seed (CDSCO/open lists) → baad mein licensed DB (CIMS/MIMS/1mg partner) | Abhi allergy warning patient.allergies se chal rahi hai; interaction DB Phase 5 tak defer ok        |
| 11  | **Lab / pharmacy partners** (Thyrocare, Redcliffe, Healthians; 1mg/PharmEasy) | Lab home-collection booking, medicine order                                             | B2B partnership + API creds                                                                                          | Sales-led, self-serve nahi. Pehle in-house LabOrder/LabResult banao, partner API baad mein          |

### P3 — Phase 5 (compliance)

| #   | API                                                                         | Kyun                                                       | Kya lena hai                                                                                                                                                                        | Notes                                                                 |
| --- | --------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 12  | **ABDM / ABHA**                                                             | ABHA create/link (patient), HIP/HIU, consent, care-context | ABDM Sandbox registration → `clientId` + `clientSecret`; baad mein **HFR** (facility) + **HPR** (doctor) IDs; milestone certification (M1 ABHA, M2 HIP, M3 HIU) production se pehle | Sabse lamba lead-time (weeks–months). Sandbox pehle, jaldi apply karo |
| 13  | **GSTIN verify** (Sandbox.co.in / Masters India)                            | Register form mein GSTIN auto-validate, legal name fill    | API key                                                                                                                                                                             | Optional; regex validation se kaam chal jata hai                      |
| 14  | **Pincode / geocode** (India Post pincode API free; Google Places optional) | City/state autofill, clinic discoverability                | Free pincode API ya Google Maps key                                                                                                                                                 | Google sirf agar "clinic near me" search chahiye                      |
| 15  | **Error monitoring** (Sentry)                                               | Healthcare mein silent failures costly                     | DSN                                                                                                                                                                                 | Optional                                                              |

### Skip / API available nahi

- **Medical council (NMC IMR) registration verify** — public API nahi; manual verification + `registrationVerified` flag.
- **Insurance / TPA claim** — scope se bahar abhi.

---

## 3. Env vars jo add honge

```
# P1
WHATSAPP_RX_TEMPLATE_NAME=            WHATSAPP_REMINDER_TEMPLATE_NAME=
STORAGE_BUCKET= STORAGE_ACCESS_KEY= STORAGE_SECRET_KEY= STORAGE_ENDPOINT=
RAZORPAY_WEBHOOK_SECRET=
# P2
FCM_SERVICE_ACCOUNT_JSON=
VIDEO_API_KEY= VIDEO_API_SECRET=
SMS_AUTH_KEY= SMS_SENDER_ID= SMS_DLT_ENTITY_ID=
STT_API_KEY=
ANTHROPIC_API_KEY=
# P3
ABDM_CLIENT_ID= ABDM_CLIENT_SECRET= ABDM_BASE_URL=
```

## 4. Aaj hi shuru karne wale (long lead-time)

1. **ABDM sandbox** registration — approval slow.
2. **SMS DLT** registration — 2–7 din typical.
3. **WhatsApp templates** submit (reminder, Rx document) — Meta review 24–48h.
4. Storage bucket + Firebase project — 10 min kaam, Phase 2/3 unblock.
