const path = require("node:path");

// Load environment variables from project root.
require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const { createBackup, verifyBackup } = require("./services/backupService");

async function main() {
  try {
    console.log("Creating Magno Dental backup...");

    const result = await createBackup();

    console.log("Backup created successfully!");
    console.log("Location:", result.backupPath);
    console.log("Patient images:", result.imageCount);

    console.log("Verifying backup...");

    await verifyBackup(result.backupPath);

    console.log("Backup verification successful!");
  } catch (error) {
    console.error("Backup failed:", error.message);
    process.exitCode = 1;
  }
}

main();
