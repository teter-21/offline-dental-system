const { sendMail } = require("./emailTransport");
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]);

// Password recovery is the only remaining email workflow. Appointments are entered in-clinic.
const sendPasswordResetEmail = async (user, resetUrl) => sendMail({
  from: `"Magno Dental Clinic" <${process.env.EMAIL_USER}>`,
  to: user.email,
  subject: "Reset Your Password - Magno Dental Clinic",
  html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px">
    <div style="max-width:540px;margin:auto;background:#fff;border:1px solid #ddd;padding:28px">
      <h2>Magno Dental Clinic</h2><h3>Reset Your Password</h3>
      <p>Hello ${escapeHtml(user.fullname)},</p><p>We received a request to reset your clinic account password.</p>
      <p><a href="${escapeHtml(resetUrl)}">Reset Password</a></p>
      <p>This link expires in one hour. If you did not request it, you can ignore this email.</p>
    </div></body></html>`,
});
module.exports = { sendPasswordResetEmail };
