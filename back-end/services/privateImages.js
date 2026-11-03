// Private, local patient image storage. Images are never exposed through static hosting.
const sharp = require("sharp");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
const { getSQLite } = require("../config/sqlite");
const STORE = path.resolve(
  process.env.PATIENT_IMAGES_DIR ||
    path.join(__dirname, "../storage/patient-images"),
);
const MAX_BYTES = 2 * 1024 * 1024;
async function sanitizeImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_BYTES)
    throw new Error("Invalid image size.");
  const image = sharp(buffer, {
    limitInputPixels: 16000000,
    failOn: "warning",
    animated: false,
  });
  const metadata = await image.metadata();
  if (
    !["jpeg", "png", "gif"].includes(metadata.format) ||
    !metadata.width ||
    !metadata.height
  )
    throw new Error("Only genuine JPG, PNG and GIF images are allowed.");
  return image
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}
async function validateImage(req, res, next) {
  if (!req.file) return next();
  try {
    req.file.buffer = await sanitizeImage(req.file.buffer);
    req.file.mimetype = "image/jpeg";
    next();
  } catch {
    return res.status(400).json({
      message:
        "Upload a valid JPG, PNG or GIF image up to 2 MB and 16 million pixels.",
    });
  }
}
async function uploadPrivateImage(buffer) {
  // Only generated random names are written; no user-provided paths are accepted.
  const filename = `${crypto.randomUUID()}.jpg`;
  await fs.mkdir(STORE, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(STORE, filename), buffer, {
    flag: "wx",
    mode: 0o600,
  });
  return `local-private:${filename}`;
}
function localFilename(value) {
  const match = /^local-private:([a-f0-9-]{36}\.jpg)$/.exec(
    String(value || ""),
  );
  return match ? match[1] : null;
}
async function getPatientImage(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    return res.status(404).json({ message: "Image not found." });
  try {
    const patient = getSQLite()
      .prepare("SELECT image FROM patients WHERE id = ? LIMIT 1")
      .get(id);
    const filename = localFilename(patient?.image);
    if (!filename) return res.status(404).json({ message: "Image not found." });
    const buffer = await fs.readFile(path.join(STORE, filename));
    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return res.send(buffer);
  } catch (error) {
    console.error("Local patient image unavailable:", error.code || error.name);
    return res.status(404).json({ message: "Image unavailable." });
  }
}
function maskImages(value) {
  if (Array.isArray(value)) return value.map(maskImages);
  if (!value || typeof value !== "object" || value instanceof Date)
    return value;
  const result = Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    result[key] =
      key === "image"
        ? child &&
          Number.isSafeInteger(Number(value.id)) &&
          Number(value.id) > 0
          ? `/patient-images/${Number(value.id)}?v=${crypto.createHash("sha256").update(String(child)).digest("hex").slice(0, 16)}`
          : null
        : maskImages(child);
  }
  return result;
}
module.exports = {
  sanitizeImage,
  validateImage,
  uploadPrivateImage,
  getPatientImage,
  maskImages,
};
