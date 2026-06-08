import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { JobRecord, JobRequest, JobStatus } from "./types";

interface JobStoreOptions {
  dataDir: string;
}

export interface JobStore {
  create(request: JobRequest): Promise<JobRecord>;
  get(id: string): Promise<JobRecord | undefined>;
  update(id: string, patch: Partial<JobRecord>): Promise<JobRecord>;
  resolveJobFile(job: JobRecord, relativePath: string): string;
}

function now(): string {
  return new Date().toISOString();
}

function createId(): string {
  return `job_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

async function writeJob(job: JobRecord): Promise<void> {
  await fs.writeFile(path.join(job.dir, "job.json"), `${JSON.stringify(job, null, 2)}\n`);
}

export function createJobStore(options: JobStoreOptions): JobStore {
  const jobsDir = path.join(options.dataDir, "jobs");
  const jobs = new Map<string, JobRecord>();

  return {
    async create(request: JobRequest): Promise<JobRecord> {
      const id = createId();
      const dir = path.join(jobsDir, id);
      const outputDir = path.join(dir, "output");
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(path.join(dir, "input.json"), `${JSON.stringify(request.input ?? {}, null, 2)}\n`);
      const timestamp = now();
      const job: JobRecord = {
        id,
        skill: request.skill,
        operation: request.operation ?? "default",
        status: "queued",
        dir,
        outputDir,
        createdAt: timestamp,
        updatedAt: timestamp,
        files: [],
        webhookUrl: request.webhookUrl,
      };
      jobs.set(id, job);
      await writeJob(job);
      return job;
    },

    async get(id: string): Promise<JobRecord | undefined> {
      const existing = jobs.get(id);
      if (existing) {
        return existing;
      }
      const file = path.join(jobsDir, id, "job.json");
      try {
        const raw = await fs.readFile(file, "utf8");
        const parsed = JSON.parse(raw) as JobRecord;
        jobs.set(id, parsed);
        return parsed;
      } catch {
        return undefined;
      }
    },

    async update(id: string, patch: Partial<JobRecord>): Promise<JobRecord> {
      const job = await this.get(id);
      if (!job) {
        throw new Error(`Unknown job: ${id}`);
      }
      const next: JobRecord = { ...job, ...patch, updatedAt: now() };
      jobs.set(id, next);
      await writeJob(next);
      return next;
    },

    resolveJobFile(job: JobRecord, relativePath: string): string {
      const resolved = path.resolve(job.outputDir, relativePath);
      const outputRoot = path.resolve(job.outputDir);
      if (resolved !== outputRoot && !resolved.startsWith(`${outputRoot}${path.sep}`)) {
        throw new Error("Requested file is outside job output directory");
      }
      return resolved;
    },
  };
}

export function isTerminalStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed";
}
