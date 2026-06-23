# baoyu-worker API

`baoyu-worker` wraps the `baoyu-skills` repository as an HTTP service for tools such as n8n. The worker exposes every marketplace skill through a fixed skill registry. CLI-backed skills run through Bun with array-form arguments. Instruction-driven skills return a packaged skill contract that an upstream agent workflow can execute with the configured text or image backend.

This worker layer is maintained for the private `kingdomwang55/baoyu-skills.git` fork and is not part of the upstream `JimLiu/baoyu-skills` marketplace release. It is expected to move into an independent project later; until then, these docs describe the private worker branch behavior.

For host deployment steps, see [baoyu-worker 宿主机部署指南](baoyu-worker-deployment.md).

## Run With Docker

Create an environment file from the grouped example:

```bash
cp apps/baoyu-worker/.env.example .env
```

Edit `.env` before starting the service. At minimum set a production token:

```bash
BAOYU_WORKER_TOKEN=replace-with-a-long-random-token
```

Then start the worker:

```bash
docker compose -f apps/baoyu-worker/docker-compose.example.yml up --build
```

The service listens on port `8787` by default. The image installs both root dependencies and dependencies declared by each `skills/*/scripts/package.json`, so CLI-backed skills can run inside the container without a separate setup step.

If Docker reports `failed to connect to the docker API` or cannot find `docker.sock`, start Docker Desktop or the Docker daemon on the host before running the compose command.

For Chrome/CDP skills, keep `/data/chrome-profile` mounted so browser login state survives container restarts.

## Environment Pass-Through

`docker-compose.example.yml` intentionally passes through every environment variable currently read by the wrapped worker or skill scripts. The worker runner also forwards the container environment to child skill processes. This prevents provider keys, gateway base URLs, Coding Plan endpoints, browser profile paths, cookies, and proxy settings from being silently dropped by Docker Compose.

The `.env` example is grouped by purpose:

- Worker runtime: `BAOYU_WORKER_TOKEN`, `BAOYU_WORKER_DATA_DIR`, `BAOYU_CHROME_PROFILE_DIR`, `PORT`, `HOST`.
- OpenAI-compatible endpoints and gateways: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_API_DIALECT`, `OPENAI_IMAGE_USE_CHAT`.
- Google/Gemini API provider: `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_BASE_URL`, `GOOGLE_IMAGE_MODEL`.
- OpenRouter gateways: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_TITLE`, `OPENROUTER_IMAGE_MODEL`.
- Chinese and gateway providers: DashScope, Volcengine Ark/Seedream/Jimeng, Z.AI/BigModel, MiniMax.
- Azure, Replicate, and Agnes provider settings.
- Browser-auth and platform skills: Gemini Web, X/Twitter, WeChat, Weibo, YouTube, Telegram callbacks.
- Network proxies: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`.

OpenAI-compatible gateways and Coding Plan providers usually need both an API key and a base URL. For Volcengine Ark Coding Plan using the OpenAI-compatible protocol:

```bash
OPENAI_API_KEY=your-volcengine-api-key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
```

Important: pass-through only makes variables available inside the container. A variable has an effect only when the selected skill actually reads it. For example, current code reads `OPENAI_BASE_URL` in the `baoyu-image-gen` OpenAI-compatible image provider, but it does not read a generic `OPENAI_MODEL` variable.

### Skill-Specific Environment Notes

| Skill area | Variables read by current code |
|------------|--------------------------------|
| Worker server | `BAOYU_WORKER_TOKEN`, `BAOYU_WORKER_DATA_DIR`, `BAOYU_CHROME_PROFILE_DIR`, `PORT`, `HOST` |
| `baoyu-image-gen` | `OPENAI_*`, `GOOGLE_*`, `GEMINI_API_KEY`, `OPENROUTER_*`, `DASHSCOPE_*`, `ARK_API_KEY`, `SEEDREAM_*`, `ZAI_*`, `BIGMODEL_*`, `MINIMAX_*`, `JIMENG_*`, `AZURE_OPENAI_*`, `REPLICATE_*`, `AGNES_*`, `BAOYU_IMAGE_GEN_AGNES_*`, `BAOYU_CODEX_IMAGEGEN_*`, `BAOYU_IMAGE_GEN_MAX_WORKERS`, proxy variables |
| `baoyu-danger-gemini-web` | `GEMINI_WEB_*`, `BAOYU_CHROME_PROFILE_DIR` |
| `baoyu-danger-x-to-markdown` | `X_AUTH_TOKEN`, `X_CT0`, `X_GUEST_TOKEN`, `X_TWID`, `X_BEARER_TOKEN`, `X_USER_AGENT`, `X_CLIENT_TRANSACTION_ID`, `X_DATA_DIR`, `X_COOKIE_PATH`, `X_CHROME_PROFILE_DIR`, `BAOYU_CHROME_PROFILE_DIR` |
| URL/browser fetch skills | `BAOYU_CHROME_PROFILE_DIR` |
| WeChat/Weibo/X browser posting | `WECHAT_BROWSER_*`, `WEIBO_BROWSER_*`, `X_BROWSER_*`, `BAOYU_CHROME_PROFILE_DIR` |
| WeChat article helper | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `XDG_CONFIG_HOME` |
| YouTube transcript | `YOUTUBE_TRANSCRIPT_COOKIES_FROM_BROWSER` |
| Instruction-driven skills | The worker packages instructions and input; upstream agent workflows decide which backend variables to use |

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

Binary files can be sent as base64 file objects. The worker writes the decoded bytes under the job directory before running the selected skill:

```json
{
  "skill": "baoyu-post-to-wechat",
  "operation": "api",
  "input": {
    "files": {
      "imgs/cover.png": {
        "encoding": "base64",
        "contentType": "image/png",
        "data": "iVBORw0KGgo..."
      }
    }
  }
}
```

All `input.files` paths are relative to the job directory. Paths that escape the job directory, such as `../secret.txt`, are rejected. The `contentType` field is accepted as descriptive metadata; the worker writes bytes according to `encoding` and `data`.

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

### WeChat Article API

`baoyu-post-to-wechat` supports first-class HTTP publishing through the `api` operation. Markdown text is written to `input.md`, HTML text is written to `input.html`, and relative image/cover paths resolve inside the job directory.

Markdown article:

```json
{
  "skill": "baoyu-post-to-wechat",
  "operation": "api",
  "input": {
    "markdown": "---\ntitle: 文章标题\nauthor: 宝玉\nsummary: 摘要\ncover: imgs/cover.png\n---\n\n# 文章标题\n\n正文\n\n![配图](imgs/a.png)",
    "files": {
      "imgs/cover.png": {
        "encoding": "base64",
        "contentType": "image/png",
        "data": "iVBORw0KGgo..."
      },
      "imgs/a.png": {
        "encoding": "base64",
        "contentType": "image/png",
        "data": "iVBORw0KGgo..."
      }
    },
    "theme": "grace",
    "color": "blue",
    "author": "宝玉",
    "summary": "摘要",
    "sourceUrl": "https://example.com/original"
  }
}
```

HTML article:

```json
{
  "skill": "baoyu-post-to-wechat",
  "operation": "api",
  "input": {
    "html": "<!doctype html><html><head><title>文章标题</title></head><body><section style=\"font-size:16px;line-height:1.8;\">正文<img src=\"imgs/a.png\"></section></body></html>",
    "files": {
      "imgs/cover.png": {
        "encoding": "base64",
        "contentType": "image/png",
        "data": "iVBORw0KGgo..."
      },
      "imgs/a.png": {
        "encoding": "base64",
        "contentType": "image/png",
        "data": "iVBORw0KGgo..."
      }
    },
    "cover": "imgs/cover.png",
    "title": "文章标题",
    "author": "宝玉",
    "summary": "摘要"
  }
}
```

Supported structured fields for `operation: "api"`:

| Field | CLI flag | Notes |
|-------|----------|-------|
| `markdown` | file argument | Written to `{job.dir}/input.md`; do not pre-render to HTML for markdown workflows |
| `html` | file argument | Written to `{job.dir}/input.html`; inline styles should already be in the HTML |
| `file` | file argument | Existing container path escape hatch when no `markdown` or `html` field is provided |
| `theme` | `--theme` | Markdown rendering theme |
| `color` | `--color` | Markdown rendering primary color |
| `title` | `--title` | Overrides frontmatter or HTML title |
| `author` | `--author` | Author name |
| `summary` | `--summary` | Draft digest |
| `sourceUrl` | `--source-url` | Original article URL shown as 阅读原文 |
| `cover` | `--cover` | Relative paths resolve inside the job directory; absolute paths are passed through |
| `account` | `--account` | Multi-account alias |
| `noCite` | `--no-cite` | Keeps ordinary markdown links inline |
| `dryRun` | `--dry-run` | Renders and validates without publishing |
| `remote` | `--remote` | Routes WeChat API calls through SSH SOCKS5 |
| `remoteHost` | `--remote-host` | Remote host for allowlisted IP publishing |
| `remoteUser` | `--remote-user` | SSH user |
| `remotePort` | `--remote-port` | SSH port |
| `remoteIdentityFile` | `--remote-identity-file` | SSH private key path |
| `remoteKnownHostsFile` | `--remote-known-hosts-file` | known_hosts path |
| `remoteStrictHostKeyChecking` | `--remote-strict-host-key-checking` | `yes`, `no`, or `accept-new` |
| `remoteConnectTimeout` | `--remote-connect-timeout` | SSH connect timeout in seconds |
| `remoteProxyJump` | `--remote-proxy-jump` | SSH ProxyJump spec |

`input.rawArgs` remains supported and takes precedence over all structured fields for advanced/manual invocations.

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
