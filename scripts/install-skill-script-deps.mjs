import { spawn, spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const skillsDir = path.join(root, "skills");

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed in ${cwd} with exit code ${code}`));
    });
  });
}

function detectBun() {
  const bun = spawnSync("bun", ["--version"], { stdio: "ignore" });
  if (bun.status === 0) {
    return { command: "bun", args: [] };
  }
  const npx = spawnSync("npx", ["--version"], { stdio: "ignore" });
  if (npx.status === 0) {
    return { command: "npx", args: ["-y", "bun"] };
  }
  throw new Error("bun is required. Install bun or ensure npx is available for npx -y bun.");
}

const bunRuntime = detectBun();
const skills = await readdir(skillsDir, { withFileTypes: true });

for (const skill of skills) {
  if (!skill.isDirectory()) {
    continue;
  }
  const scriptsDir = path.join(skillsDir, skill.name, "scripts");
  const packageFile = path.join(scriptsDir, "package.json");
  if (!(await exists(packageFile))) {
    continue;
  }
  console.log(`[install-skill-script-deps] ${path.relative(root, scriptsDir)}`);
  await run(bunRuntime.command, [...bunRuntime.args, "install"], scriptsDir);
}
