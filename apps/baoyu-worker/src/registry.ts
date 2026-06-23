import path from "node:path";

import type { InvocationRequest, SkillInvocation, SkillSummary } from "./types";

type Input = Record<string, unknown>;

interface OperationDefinition {
  entry?: string;
  description: string;
  buildArgs?: (input: Input, workDir: string) => string[];
}

interface SkillDefinition {
  id: string;
  skillPath: string;
  kind: "cli" | "instruction" | "hybrid";
  defaultOperation: string;
  operations: Record<string, OperationDefinition>;
}

function stringValue(input: Input, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringishValue(input: Input, key: string): string | undefined {
  const value = input[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function booleanValue(input: Input, key: string): boolean {
  return input[key] === true;
}

function rawArgs(input: Input): string[] | undefined {
  const value = input.rawArgs;
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && !item.includes("\0"))) {
    throw new Error("input.rawArgs must be an array of strings");
  }
  return value;
}

function withRawArgs(input: Input, fallback: string[]): string[] {
  return rawArgs(input) ?? fallback;
}

function pushFlag(args: string[], flag: string, value?: string): void {
  if (value !== undefined) {
    args.push(flag, value);
  }
}

function outputPath(workDir: string, name: string): string {
  return path.join(workDir, "output", name);
}

function requireString(input: Input, key: string): string {
  const value = stringValue(input, key);
  if (!value) {
    throw new Error(`input.${key} is required`);
  }
  return value;
}

function urlToMarkdownArgs(input: Input, workDir: string): string[] {
  const args = [
    requireString(input, "url"),
    "--output",
    stringValue(input, "output") ?? outputPath(workDir, "article.md"),
    "--format",
    stringValue(input, "format") ?? "markdown",
  ];
  if (booleanValue(input, "downloadMedia")) args.push("--download-media");
  if (booleanValue(input, "headless")) args.push("--headless");
  pushFlag(args, "--adapter", stringValue(input, "adapter"));
  pushFlag(args, "--debug-dir", stringValue(input, "debugDir"));
  pushFlag(args, "--cdp-url", stringValue(input, "cdpUrl"));
  pushFlag(args, "--browser-path", stringValue(input, "browserPath"));
  pushFlag(args, "--chrome-profile-dir", stringValue(input, "chromeProfileDir"));
  pushFlag(args, "--wait-for", stringValue(input, "waitFor"));
  pushFlag(args, "--timeout", stringValue(input, "timeoutMs"));
  return args;
}

function imageGenArgs(input: Input, workDir: string): string[] {
  const args: string[] = [];
  const prompt = stringValue(input, "prompt");
  if (prompt) {
    args.push("--prompt", prompt);
  }
  const promptFiles = input.promptFiles;
  if (Array.isArray(promptFiles) && promptFiles.every((item) => typeof item === "string")) {
    args.push("--promptfiles", ...promptFiles);
  }
  pushFlag(args, "--image", stringValue(input, "image") ?? outputPath(workDir, "image.png"));
  pushFlag(args, "--provider", stringValue(input, "provider"));
  pushFlag(args, "--model", stringValue(input, "model"));
  pushFlag(args, "--ar", stringValue(input, "ar"));
  pushFlag(args, "--size", stringValue(input, "size"));
  pushFlag(args, "--quality", stringValue(input, "quality"));
  pushFlag(args, "--response-format", stringValue(input, "responseFormat"));
  if (booleanValue(input, "json")) args.push("--json");
  return args;
}

function markdownPathArgs(input: Input, workDir: string): string[] {
  return [stringValue(input, "file") ?? path.join(workDir, "input.md")];
}

function translateArgs(input: Input, workDir: string): string[] {
  const args = markdownPathArgs(input, workDir);
  pushFlag(args, "--to", stringValue(input, "to"));
  pushFlag(args, "--from", stringValue(input, "from"));
  pushFlag(args, "--output", stringValue(input, "output") ?? outputPath(workDir, "translation.md"));
  return args;
}

function jobRelativePath(workDir: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(workDir, value);
}

function wechatApiArgs(input: Input, workDir: string): string[] {
  const custom = rawArgs(input);
  if (custom) return custom;

  const args: string[] = [];
  if (typeof input.markdown === "string") {
    args.push(path.join(workDir, "input.md"));
  } else if (typeof input.html === "string") {
    args.push(path.join(workDir, "input.html"));
  } else if (stringValue(input, "file")) {
    args.push(stringValue(input, "file")!);
  } else {
    throw new Error("baoyu-post-to-wechat api requires input.markdown, input.html, input.file, or input.rawArgs");
  }

  pushFlag(args, "--theme", stringValue(input, "theme"));
  pushFlag(args, "--color", stringValue(input, "color"));
  pushFlag(args, "--title", stringValue(input, "title"));
  pushFlag(args, "--author", stringValue(input, "author"));
  pushFlag(args, "--summary", stringValue(input, "summary"));
  pushFlag(args, "--source-url", stringValue(input, "sourceUrl") ?? stringValue(input, "source-url"));
  const cover = stringValue(input, "cover");
  if (cover) pushFlag(args, "--cover", jobRelativePath(workDir, cover));
  pushFlag(args, "--account", stringValue(input, "account"));
  if (booleanValue(input, "noCite") || booleanValue(input, "no-cite")) args.push("--no-cite");
  if (booleanValue(input, "dryRun") || booleanValue(input, "dry-run")) args.push("--dry-run");
  if (booleanValue(input, "remote")) args.push("--remote");
  pushFlag(args, "--remote-host", stringValue(input, "remoteHost") ?? stringValue(input, "remote-host"));
  pushFlag(args, "--remote-user", stringValue(input, "remoteUser") ?? stringValue(input, "remote-user"));
  pushFlag(args, "--remote-port", stringishValue(input, "remotePort") ?? stringishValue(input, "remote-port"));
  pushFlag(args, "--remote-identity-file", stringValue(input, "remoteIdentityFile") ?? stringValue(input, "remote-identity-file"));
  pushFlag(args, "--remote-known-hosts-file", stringValue(input, "remoteKnownHostsFile") ?? stringValue(input, "remote-known-hosts-file"));
  pushFlag(args, "--remote-strict-host-key-checking", stringValue(input, "remoteStrictHostKeyChecking") ?? stringValue(input, "remote-strict-host-key-checking"));
  pushFlag(args, "--remote-connect-timeout", stringishValue(input, "remoteConnectTimeout") ?? stringishValue(input, "remote-connect-timeout"));
  pushFlag(args, "--remote-proxy-jump", stringValue(input, "remoteProxyJump") ?? stringValue(input, "remote-proxy-jump"));
  return args;
}

const registry: SkillDefinition[] = [
  instruction("baoyu-article-illustrator"),
  hybrid("baoyu-comic", "instruction", {
    instruction: { description: "Generate comic assets from the skill instructions." },
    "merge-to-pdf": { entry: "skills/baoyu-comic/scripts/merge-to-pdf.ts", description: "Merge comic page images into a PDF." },
  }),
  cli("baoyu-compress-image", "compress", {
    compress: { entry: "skills/baoyu-compress-image/scripts/main.ts", description: "Compress image files.", buildArgs: (input) => withRawArgs(input, [requireString(input, "input")]) },
  }),
  instruction("baoyu-cover-image"),
  cli("baoyu-danger-gemini-web", "generate", {
    generate: { entry: "skills/baoyu-danger-gemini-web/scripts/main.ts", description: "Generate text or images with Gemini Web.", buildArgs: (input) => withRawArgs(input, []) },
  }),
  cli("baoyu-danger-x-to-markdown", "convert", {
    convert: { entry: "skills/baoyu-danger-x-to-markdown/scripts/main.ts", description: "Convert X content to Markdown.", buildArgs: (input) => withRawArgs(input, [requireString(input, "url")]) },
    "tweet-to-markdown": { entry: "skills/baoyu-danger-x-to-markdown/scripts/tweet-to-markdown.ts", description: "Legacy tweet converter.", buildArgs: (input) => withRawArgs(input, [requireString(input, "url")]) },
  }),
  cli("baoyu-diagram", "render", {
    render: { entry: "skills/baoyu-diagram/scripts/main.ts", description: "Render a diagram from Mermaid or prompt input.", buildArgs: (input) => withRawArgs(input, []) },
  }),
  cli("baoyu-electron-extract", "extract", {
    extract: { entry: "skills/baoyu-electron-extract/scripts/main.ts", description: "Extract resources from an Electron app.", buildArgs: (input) => withRawArgs(input, [requireString(input, "input")]) },
  }),
  cli("baoyu-format-markdown", "format", {
    format: { entry: "skills/baoyu-format-markdown/scripts/main.ts", description: "Format a Markdown file.", buildArgs: (input, workDir) => withRawArgs(input, markdownPathArgs(input, workDir)) },
  }),
  cli("baoyu-image-gen", "generate", {
    generate: { entry: "skills/baoyu-image-gen/scripts/main.ts", description: "Generate images through configured providers.", buildArgs: (input, workDir) => withRawArgs(input, imageGenArgs(input, workDir)) },
    "build-batch": { entry: "skills/baoyu-image-gen/scripts/build-batch.ts", description: "Build a batch image generation file.", buildArgs: (input) => withRawArgs(input, []) },
  }),
  instruction("baoyu-infographic"),
  cli("baoyu-markdown-to-html", "convert", {
    convert: { entry: "skills/baoyu-markdown-to-html/scripts/main.ts", description: "Convert Markdown to styled HTML.", buildArgs: (input, workDir) => withRawArgs(input, markdownPathArgs(input, workDir)) },
  }),
  cli("baoyu-post-to-weibo", "post", {
    post: { entry: "skills/baoyu-post-to-weibo/scripts/weibo-post.ts", description: "Publish a Weibo post.", buildArgs: (input) => withRawArgs(input, []) },
    article: { entry: "skills/baoyu-post-to-weibo/scripts/weibo-article.ts", description: "Publish a Weibo article.", buildArgs: (input) => withRawArgs(input, []) },
    "md-to-html": { entry: "skills/baoyu-post-to-weibo/scripts/md-to-html.ts", description: "Convert Markdown to Weibo HTML.", buildArgs: (input, workDir) => withRawArgs(input, markdownPathArgs(input, workDir)) },
  }),
  cli("baoyu-post-to-wechat", "article", {
    article: { entry: "skills/baoyu-post-to-wechat/scripts/wechat-article.ts", description: "Publish a WeChat article via browser automation.", buildArgs: (input) => withRawArgs(input, []) },
    api: { entry: "skills/baoyu-post-to-wechat/scripts/wechat-api.ts", description: "Publish through WeChat API.", buildArgs: (input, workDir) => wechatApiArgs(input, workDir) },
    browser: { entry: "skills/baoyu-post-to-wechat/scripts/wechat-browser.ts", description: "Open WeChat browser workflow.", buildArgs: (input) => withRawArgs(input, []) },
    "md-to-wechat": { entry: "skills/baoyu-post-to-wechat/scripts/md-to-wechat.ts", description: "Convert Markdown to WeChat HTML.", buildArgs: (input, workDir) => withRawArgs(input, markdownPathArgs(input, workDir)) },
  }),
  cli("baoyu-post-to-x", "article", {
    article: { entry: "skills/baoyu-post-to-x/scripts/x-article.ts", description: "Publish an X article.", buildArgs: (input) => withRawArgs(input, []) },
    quote: { entry: "skills/baoyu-post-to-x/scripts/x-quote.ts", description: "Publish an X quote post.", buildArgs: (input) => withRawArgs(input, []) },
    video: { entry: "skills/baoyu-post-to-x/scripts/x-video.ts", description: "Publish an X video post.", buildArgs: (input) => withRawArgs(input, []) },
    browser: { entry: "skills/baoyu-post-to-x/scripts/x-browser.ts", description: "Open browser posting workflow.", buildArgs: (input) => withRawArgs(input, []) },
    "md-to-html": { entry: "skills/baoyu-post-to-x/scripts/md-to-html.ts", description: "Convert Markdown to X Article HTML.", buildArgs: (input, workDir) => withRawArgs(input, markdownPathArgs(input, workDir)) },
  }),
  hybrid("baoyu-slide-deck", "instruction", {
    instruction: { description: "Generate slide deck images from the skill instructions." },
    "merge-to-pdf": { entry: "skills/baoyu-slide-deck/scripts/merge-to-pdf.ts", description: "Merge slide images into a PDF." },
    "merge-to-pptx": { entry: "skills/baoyu-slide-deck/scripts/merge-to-pptx.ts", description: "Merge slide images into a PPTX." },
  }),
  cli("baoyu-translate", "translate", {
    translate: { entry: "skills/baoyu-translate/scripts/main.ts", description: "Translate Markdown or text content.", buildArgs: (input, workDir) => withRawArgs(input, translateArgs(input, workDir)) },
    chunk: { entry: "skills/baoyu-translate/scripts/chunk.ts", description: "Chunk long content for translation.", buildArgs: (input) => withRawArgs(input, []) },
  }),
  cli("baoyu-url-to-markdown", "convert", {
    convert: { entry: "skills/baoyu-url-to-markdown/scripts/lib/cli.ts", description: "Fetch a URL and convert it to Markdown or JSON.", buildArgs: (input, workDir) => withRawArgs(input, urlToMarkdownArgs(input, workDir)) },
  }),
  instruction("baoyu-wechat-summary"),
  instruction("baoyu-xhs-images"),
  cli("baoyu-youtube-transcript", "transcript", {
    transcript: { entry: "skills/baoyu-youtube-transcript/scripts/main.ts", description: "Download YouTube transcript and metadata.", buildArgs: (input) => withRawArgs(input, [requireString(input, "url")]) },
  }),
];

function cli(id: string, defaultOperation: string, operations: Record<string, OperationDefinition>): SkillDefinition {
  return { id, skillPath: `skills/${id}/SKILL.md`, kind: "cli", defaultOperation, operations };
}

function instruction(id: string): SkillDefinition {
  return {
    id,
    skillPath: `skills/${id}/SKILL.md`,
    kind: "instruction",
    defaultOperation: "instruction",
    operations: {
      instruction: { description: "Package the skill instructions and request input for agent-mediated execution." },
    },
  };
}

function hybrid(id: string, defaultOperation: string, operations: Record<string, OperationDefinition>): SkillDefinition {
  return { id, skillPath: `skills/${id}/SKILL.md`, kind: "hybrid", defaultOperation, operations };
}

export function listSkills(): SkillSummary[] {
  return registry.map((skill) => ({
    id: skill.id,
    kind: skill.kind,
    defaultOperation: skill.defaultOperation,
    operations: Object.keys(skill.operations),
    skillPath: skill.skillPath,
  }));
}

export function getSkill(id: string): SkillSummary | undefined {
  return listSkills().find((skill) => skill.id === id);
}

export function buildInvocation(request: InvocationRequest): SkillInvocation {
  const skill = registry.find((item) => item.id === request.skill);
  if (!skill) {
    throw new Error(`Unknown skill: ${request.skill}`);
  }

  const operationName = request.operation ?? skill.defaultOperation;
  const operation = skill.operations[operationName];
  if (!operation) {
    throw new Error(`Unknown operation for ${skill.id}: ${operationName}`);
  }

  if (!operation.entry) {
    return {
      kind: "instruction",
      skill: skill.id,
      operation: operationName,
      skillPath: skill.skillPath,
      inputPath: path.join(request.workDir, "input.json"),
      outputPath: path.join(request.workDir, "output", "instruction-package.json"),
    };
  }

  return {
    kind: "cli",
    skill: skill.id,
    operation: operationName,
    command: "bun",
    args: [operation.entry, ...(operation.buildArgs?.(request.input ?? {}, request.workDir) ?? [])],
    cwd: request.repoRoot ?? process.cwd(),
  };
}
