const { authenticator } = require("otplib");
const QRCode = require("qrcode");

// +/-1 step tolerates clock drift between server and phone.
authenticator.options = { window: 1 };

const generateSecret = () => authenticator.generateSecret();

const verifyToken = (token, secret) => {
  try {
    return authenticator.verify({ token: String(token), secret });
  } catch {
    return false;
  }
};

const qrFor = async (email, secret) => {
  const otpauthUrl = authenticator.keyuri(email, "NestDoc", secret);
  return { otpauthUrl, qrCode: await QRCode.toDataURL(otpauthUrl) };
};

module.exports = { generateSecret, verifyToken, qrFor };
