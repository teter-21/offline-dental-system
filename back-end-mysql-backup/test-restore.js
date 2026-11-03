const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { restoreBackup } = require("./services/restoreService");

async function main() {
  const folder = process.argv[2];

  if (!folder || !path.isAbsolute(folder)) {
    console.error(
      'Usage: node test-restore.js "C:\\full\\path\\to\\backup-folder"',
    );
    process.exitCode = 1;
    return;
  }

  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    console.log("\nWARNING: RESTORE REPLACES CURRENT DATA.");
    console.log("Stop the SQLite backend before proceeding.");
    console.log("Selected backup:", folder);

    const answer = await rl.question("\nType RESTORE to continue: ");

    if (answer !== "RESTORE") {
      console.log("Restore cancelled.");
      return;
    }

    const result = await restoreBackup(folder);

    console.log("\nRestore completed.");
    console.log("Backup date:", result.backupDate);
    console.log("Previous database:", result.previousDatabase);
    console.log("Previous images:", result.previousImages);
  } catch (error) {
    console.error("\nRestore failed:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
