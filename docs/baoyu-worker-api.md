# baoyu-worker API

`baoyu-worker` wraps the `baoyu-skills` repository as an HTTP service for tools such as n8n. The worker exposes every marketplace skill through a fixed skill registry. CLI-backed skills run through Bun with array-form arguments. Instruction-driven skills return a packaged skill contract that an upstream agent workflow can execute with the configured text or image backend.

## Run With Docker

```bash
docker compose -f apps/baoyu-worker/docker-compose.example.yml up --build
```

The service listens on port `8787`.

The image installs both root dependencies and dependencies declared by each `skills/*/scripts/package.json`, so CLI-backed skills can run inside the container without a separate setup step.

If Docker reports `failed to connect to the docker API` or cannot find `docker.sock`, start Docker Desktop or the Docker daemon on the host before running the compose command.

Required production setting:

```bash
BAOYU_WORKER_TOKEN=replace-with-a-long-random-token
```

Useful optional settings:

```bash
BAOYU_WORKER_DATA_DIR=/data
BAOYU_CHROME_PROFILE_DIR=/data/chrome-profile
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
OPENROUTER_API_KEY=...
DASHSCOPE_API_KEY=...
REPLICATE_API_TOKEN=...
```

For Chrome/CDP skills, keep `/data/chrome-profile` mounted so browser login state survives container restarts.

## Authentication

All endpoints require Bearer auth when `BAOYU_WORKER_TOKEN` is set:

```http
Authorization: Bearer replace-with-a-long-random-token
```

## Endpoints

### Health

```http
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

### List Skills

```http
GET /v1/skills
```

Response:

```json
{
  "skills": [
    {
      "id": "baoyu-url-to-markdown",
      "kind": "cli",
      "defaultOperation": "convert",
      "operations": ["convert"],
      "skillPath": "skills/baoyu-url-to-markdown/SKILL.md"
    }
  ]
}
```

`kind` values:

- `cli`: The worker runs a whitelisted Bun script.
- `instruction`: The worker writes `instruction-package.json` with the skill instructions and input.
- `hybrid`: Some operations run CLI scripts, while the default operation may be instruction-driven.

### Create Job

```http
POST /v1/jobs
Content-Type: application/json
```

Request:

```json
{
  "skill": "baoyu-url-to-markdown",
  "operation": "convert",
  "input": {
    "url": "https://example.com/article",
    "format": "markdown",
    "downloadMedia": true,
    "headless": true
  },
  "webhookUrl": "https://n8n.example.com/webhook/baoyu-worker"
}
```

Response:

```json
{
  "id": "job_mabc123_abcdef1234",
  "skill": "baoyu-url-to-markdown",
  "operation": "convert",
  "status": "queued",
  "dir": "/data/jobs/job_mabc123_abcdef1234",
  "outputDir": "/data/jobs/job_mabc123_abcdef1234/output",
  "createdAt": "2026-06-08T09:00:00.000Z",
  "updatedAt": "2026-06-08T09:00:00.000Z",
  "files": []
}
```

The job runs asynchronously. If `webhookUrl` is provided, the worker posts the final job record to that URL after completion.

### Get Job

```http
GET /v1/jobs/{jobId}
```

Terminal statuses:

- `succeeded`
- `failed`

Running statuses:

- `queued`
- `running`

### Download Output File

```http
GET /v1/jobs/{jobId}/files/{relativePath}
```

Example:

```http
GET /v1/jobs/job_mabc123_abcdef1234/files/article.md
```

Only files inside the job output directory are downloadable.

## Input Files

n8n can send small files inline:

```json
{
  "skill": "baoyu-markdown-to-html",
  "input": {
    "markdown": "# Hello\n\nGenerated from n8n."
  }
}
```

The worker writes this to:

```text
/data/jobs/{jobId}/input.md
```

For multiple text files:

```json
{
  "skill": "baoyu-image-gen",
  "input": {
    "files": {
      "prompts/hero.md": "A clean product hero image...",
      "refs/notes.txt": "Brand notes"
    },
    "rawArgs": [
      "--promptfiles",
      "/data/jobs/{jobId}/prompts/hero.md",
      "--image",
      "/data/jobs/{jobId}/output/hero.png"
    ]
  }
}
```

For paths that must include the generated job ID, prefer the convenience fields where available. For fully custom `rawArgs`, first create a job with inline files when possible, or mount shared host paths into the container.

## Calling From n8n

Use an HTTP Request node:

- Method: `POST`
- URL: `http://baoyu-worker:8787/v1/jobs`
- Authentication: Header Auth
- Header name: `Authorization`
- Header value: `Bearer {{$env.BAOYU_WORKER_TOKEN}}`
- Body Content Type: JSON

Then add a polling loop:

1. Wait 5-10 seconds.
2. `GET /v1/jobs/{{jobId}}`.
3. Continue until `status` is `succeeded` or `failed`.
4. Download each path listed in `files` with `/v1/jobs/{{jobId}}/files/{{path}}`.

If n8n exposes a webhook URL, pass it as `webhookUrl` and skip polling for long-running jobs.

## Skill Operations

Every skill listed in `.claude-plugin/marketplace.json` is registered.

| Skill | Kind | Operations |
|-------|------|------------|
| `baoyu-article-illustrator` | instruction | `instruction` |
| `baoyu-comic` | hybrid | `instruction`, `merge-to-pdf` |
| `baoyu-compress-image` | cli | `compress` |
| `baoyu-cover-image` | instruction | `instruction` |
| `baoyu-danger-gemini-web` | cli | `generate` |
| `baoyu-danger-x-to-markdown` | cli | `convert`, `tweet-to-markdown` |
| `baoyu-diagram` | cli | `render` |
| `baoyu-electron-extract` | cli | `extract` |
| `baoyu-format-markdown` | cli | `format` |
| `baoyu-image-gen` | cli | `generate`, `build-batch` |
| `baoyu-infographic` | instruction | `instruction` |
| `baoyu-markdown-to-html` | cli | `convert` |
| `baoyu-post-to-wechat` | cli | `article`, `api`, `browser`, `md-to-wechat` |
| `baoyu-post-to-weibo` | cli | `post`, `article`, `md-to-html` |
| `baoyu-post-to-x` | cli | `article`, `quote`, `video`, `browser`, `md-to-html` |
| `baoyu-slide-deck` | hybrid | `instruction`, `merge-to-pdf`, `merge-to-pptx` |
| `baoyu-translate` | cli | `translate`, `chunk` |
| `baoyu-url-to-markdown` | cli | `convert` |
| `baoyu-wechat-summary` | instruction | `instruction` |
| `baoyu-xhs-images` | instruction | `instruction` |
| `baoyu-youtube-transcript` | cli | `transcript` |

## Raw CLI Arguments

All CLI operations accept `input.rawArgs`. When present, `rawArgs` replaces the convenience argument builder for that operation:

```json
{
  "skill": "baoyu-youtube-transcript",
  "operation": "transcript",
  "input": {
    "rawArgs": [
      "https://www.youtube.com/watch?v=VIDEO_ID",
      "--language",
      "zh-Hans"
    ]
  }
}
```

The command itself is never accepted from HTTP input. Only the whitelisted skill script is selected by `skill` and `operation`.

## Examples

### URL To Markdown

```json
{
  "skill": "baoyu-url-to-markdown",
  "input": {
    "url": "https://example.com/article",
    "format": "markdown",
    "downloadMedia": true,
    "headless": true
  }
}
```

Default output:

```text
article.md
stdout.log
stderr.log
```

### Markdown To HTML

```json
{
  "skill": "baoyu-markdown-to-html",
  "input": {
    "markdown": "# Title\n\nBody text."
  }
}
```

### Image Generation

```json
{
  "skill": "baoyu-image-gen",
  "input": {
    "prompt": "A minimal editorial cover image for an automation API",
    "provider": "openai",
    "ar": "16:9",
    "quality": "2k",
    "json": true
  }
}
```

### Instruction-Driven Skill

```json
{
  "skill": "baoyu-cover-image",
  "input": {
    "title": "baoyu-worker",
    "brief": "Create an article cover image for the worker launch."
  }
}
```

Output:

```text
instruction-package.json
```

The package includes the full `SKILL.md` content and the request input.

## Security Notes

- The worker never accepts a shell command from HTTP input.
- CLI calls use array-form `spawn`.
- Job file downloads are restricted to the job output directory.
- Set `BAOYU_WORKER_TOKEN` in every shared or public environment.
- Treat external URLs and Markdown as untrusted input.
- Avoid mounting sensitive host directories into the container.
