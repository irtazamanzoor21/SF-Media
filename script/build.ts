import { build as esbuild, stop as esbuildStop } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google-cloud/storage",
  "@google/generative-ai",
  "@sendgrid/mail",
  "@uppy/companion",
  "axios",
  "bcryptjs",
  "cloudinary",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "dotenv",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "google-auth-library",
  "jsonwebtoken",
  "mammoth",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

// Keep pdf-parse external: it pulls in pdfjs-dist, which references browser
// globals (DOMMatrix/ImageData/Path2D) and createRequire(import.meta.url) at
// module-eval time. Bundled into the CJS server output it crashes Node on
// startup. Loaded as an external from node_modules it initializes fine.
//
// connect-pg-simple is bundled (was external for table.sql, but we use
// createTableIfMissing: false at server/routes.ts:970 so table.sql is never
// read at runtime). Bundling removes the runtime node_modules dependency
// that caused a MODULE_NOT_FOUND prod outage on 2026-05-18.

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll()
  .then(async () => {
    await esbuildStop();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
