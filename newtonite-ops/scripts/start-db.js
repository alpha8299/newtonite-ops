import EmbeddedPostgres from "embedded-postgres";
import path from "path";
import fs from "fs";
import net from "net";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(__dirname, "..", ".pgdata");

function checkPort(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function main() {
  const isRunning = await checkPort(5432);
  if (isRunning) {
    console.log("PostgreSQL is already active on port 5432.");
    setInterval(() => {}, 60000);
    return;
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dbDir,
    user: "newtonite",
    password: "newtonite",
    port: 5432,
    persistent: true,
  });

  const needsInit = !fs.existsSync(path.join(dbDir, "PG_VERSION"));
  if (needsInit) {
    console.log("Initializing PostgreSQL database cluster...");
    await pg.initialise();
    console.log("Database initialized.");
  }

  console.log("Starting PostgreSQL on port 5432...");
  await pg.start();
  console.log("PostgreSQL is running and ready for connections!");

  try {
    await pg.createDatabase("newtonite");
    console.log("Database 'newtonite' created.");
  } catch (err) {
    if (!err.message?.includes("already exists")) {
      console.log("Database check:", err.message);
    }
  }

  console.log("Embedded PostgreSQL is active. Press Ctrl+C to terminate.");
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  console.error("PostgreSQL start error:", err);
  process.exit(1);
});
