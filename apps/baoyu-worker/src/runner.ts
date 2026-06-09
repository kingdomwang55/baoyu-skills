import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { buildInvocation } from "./registry";
import type { JobRecord, JobRequest, SkillInvocation } from "./types";
import type { JobStore } from "./jobs";

interface RunnerOptions {
  repoRoot: string;
  store: JobStore;
  env?: Record<string, string | undefined>;
}

async function writeText(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

async function writeBytes(filePath: string, content: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

function resolveInsideJob(jobDir: string, relativePath: string): string {
  const resolved = path.resolve(jobDir, relativePath);
  const root = path.resolve(jobDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`input.files.${relativePath} escapes the job directory`);
  }
  return resolved;
}

function decodeFileContent(relativePath: string, content: unknown): string | Buffer {
  if (typeof content === "string") {
    return content;
  }
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const record = content as Record<string, unknown>;
    if (record.encoding === "base64" && typeof record.data === "string") {
      return Buffer.from(record.data, "base64");
    }
  }
  throw new Error(`input.files.${relativePath} must be a string or a base64 file object`);
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(entryPath, base));
      continue;
    }
    if (entry.isFile()) {
      files.push(path.relative(base, entryPath));
    }
  }
  return files.sort();
}

function endStream(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on("error", reject);
    stream.end(() => resolve());
  });
}

async function materializeInput(job: JobRecord, request: JobRequest): Promise<void> {
  const input = request.input ?? {};
  if (typeof input.markdown === "string") {
    await writeText(path.join(job.dir, "input.md"), input.markdown);
  }
  if (typeof input.html === "string") {
    await writeText(path.join(job.dir, "input.html"), input.html);
  }
  if (typeof input.text === "string") {
    await writeText(path.join(job.dir, "input.txt"), input.text);
  }
  const files = input.files;
  if (files && typeof files === "object" && !Array.isArray(files)) {
    for (const [relativePath, rawContent] of Object.entries(files)) {
      const resolved = resolveInsideJob(job.dir, relativePath);
      const content = decodeFileContent(relativePath, rawContent);
      if (typeof content === "string") {
        await writeText(resolved, content);
      } else {
        await writeBytes(resolved, content);
      }
    }
  }
}

async function runCli(invocation: Extract<SkillInvocation, { kind: "cli" }>, job: JobRecord, store: JobStore, env: Record<string, string | undefined>): Promise<void> {
  await writeText(path.join(job.dir, "command.json"), `${JSON.stringify({
    command: invocation.command,
    args: invocation.args,
    cwd: invocation.cwd,
  }, null, 2)}\n`);

  const stdoutPath = path.join(job.outputDir, "stdout.log");
  const stderrPath = path.join(job.outputDir, "stderr.log");
  const stdout = createWriteStream(stdoutPath);
  const stderr = createWriteStream(stderrPath);

  try {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: { ...process.env, ...env, ...invocation.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => resolve(code));
    });
    const files = await listFiles(job.outputDir);
    if (exitCode === 0) {
      await store.update(job.id, {
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        exitCode,
        files,
      });
      return;
    }
    await store.update(job.id, {
      status: "failed",
      finishedAt: new Date().toISOString(),
      exitCode,
      files,
      error: `Command exited with code ${exitCode}`,
    });
  } finally {
    await Promise.all([endStream(stdout), endStream(stderr)]);
  }
}

async function runInstruction(invocation: Extract<SkillInvocation, { kind: "instruction" }>, job: JobRecord, request: JobRequest, store: JobStore, repoRoot: string): Promise<void> {
  const instructions = await fs.readFile(path.join(repoRoot, invocation.skillPath), "utf8");
  const pkg = {
    kind: "instruction-package",
    skill: invocation.skill,
    operation: invocation.operation,
    skillPath: invocation.skillPath,
    input: request.input ?? {},
    instructions,
    note: "This skill is instruction-driven. The worker packages the skill contract and request input for an agent or upstream workflow to execute with the configured image/text backends.",
  };
  await writeText(invocation.outputPath, `${JSON.stringify(pkg, null, 2)}\n`);
  await store.update(job.id, {
    status: "succeeded",
    finishedAt: new Date().toISOString(),
    exitCode: 0,
    files: await listFiles(job.outputDir),
  });
}

async function postWebhook(url: string | undefined, job: JobRecord): Promise<void> {
  if (!url) {
    return;
  }
  await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(job),
  }).catch(() => undefined);
}

export function createRunner(options: RunnerOptions) {
  return {
    async run(job: JobRecord, request: JobRequest): Promise<void> {
      const operation = request.operation ?? undefined;
      await options.store.update(job.id, {
        status: "running",
        operation: operation ?? job.operation,
        startedAt: new Date().toISOString(),
      });
      try {
        await materializeInput(job, request);
        const invocation = buildInvocation({
          skill: request.skill,
          operation,
          input: request.input,
          workDir: job.dir,
          repoRoot: options.repoRoot,
        });
        if (invocation.kind === "instruction") {
          await runInstruction(invocation, job, request, options.store, options.repoRoot);
        } else {
          await runCli(invocation, job, options.store, options.env ?? {});
        }
      } catch (error) {
        await options.store.update(job.id, {
          status: "failed",
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          files: await listFiles(job.outputDir),
        });
      }
      const updated = await options.store.get(job.id);
      if (updated) {
        await postWebhook(request.webhookUrl, updated);
      }
    },
  };
}
