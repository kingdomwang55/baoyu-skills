export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobRequest {
  skill: string;
  operation?: string;
  input?: Record<string, unknown>;
  webhookUrl?: string;
}

export interface JobRecord {
  id: string;
  skill: string;
  operation: string;
  status: JobStatus;
  dir: string;
  outputDir: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  files: string[];
  webhookUrl?: string;
}

export interface CliInvocation {
  kind: "cli";
  skill: string;
  operation: string;
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
}

export interface InstructionInvocation {
  kind: "instruction";
  skill: string;
  operation: string;
  skillPath: string;
  inputPath: string;
  outputPath: string;
}

export type SkillInvocation = CliInvocation | InstructionInvocation;

export interface InvocationRequest {
  skill: string;
  operation?: string;
  input?: Record<string, unknown>;
  workDir: string;
  repoRoot?: string;
}

export interface SkillSummary {
  id: string;
  kind: "cli" | "instruction" | "hybrid";
  defaultOperation: string;
  operations: string[];
  skillPath: string;
}
