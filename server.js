const fs = require("fs");
const path = require("path");
const { createServer } = require("http");
const { parse } = require("url");

// Load the requested environment file before Next.js boots so that staging
// and production can share one codebase but use separate env files.
// APP_ENV can be "staging" or "production". When absent, falls back to
// NODE_ENV-based default: .env.production for production, .env.development
// for development.
const appEnv = process.env.APP_ENV || (process.env.NODE_ENV === "production" ? "production" : "development");
const envFile = appEnv === "production" ? ".env.production" : ".env.development";
const envPath = path.join(__dirname, envFile);

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  console.log(`[server] Loaded env from ${envFile}`);
} else {
  console.warn(`[server] Env file not found: ${envPath}`);
}

const next = require("next");
const port = process.env.PORT || 3000;
const app = next({ dev: false });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  }).listen(port, () => {
    console.log(`> Ready on port ${port}`);
  });
});
