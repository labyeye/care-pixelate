const nodemailer = require("nodemailer");

// Platform WhatsApp number sends AUTHENTICATION-template OTPs.
async function sendWhatsAppOtp(phone, code) {
  const token = process.env.WHATSAPP_PLATFORM_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp platform number is not configured");
  }
  const components = [{ type: "body", parameters: [{ type: "text", text: code }] }];
  if (process.env.WHATSAPP_OTP_HAS_BUTTON !== "false") {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: code }],
    });
  }
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: process.env.WHATSAPP_OTP_TEMPLATE_NAME || "user_otp",
        language: { code: process.env.WHATSAPP_OTP_TEMPLATE_LANG || "en_US" },
        components,
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "WhatsApp API error");
}

async function sendPasswordResetEmail({ to, userName, resetUrl }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("Email is not configured");
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: `"NestCare" <${process.env.SMTP_USER}>`,
    to,
    subject: "Reset your NestCare password",
    html: `<p>Hi ${String(userName).replace(/[<>&]/g, "")},</p>
<p>Click the link below to reset your NestCare password. It expires in 1 hour.</p>
<p><a href="${resetUrl}">Reset password</a></p>
<p>If you didn't request this, you can ignore this email.</p>`,
  });
}

module.exports = { sendWhatsAppOtp, sendPasswordResetEmail };
