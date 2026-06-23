# baoyu-worker 宿主机部署指南

本文档用于把远程 `worker-main` 分支中的 `baoyu-worker` 直接部署到 n8n 所在宿主机。

`baoyu-worker` 当前维护在私有 fork `kingdomwang55/baoyu-skills.git` 中，不对应上游 `JimLiu/baoyu-skills` 的 marketplace 发布内容。后续如果 worker 独立成新项目，本文档中的仓库地址和分支名也需要同步迁移。

## 前提

- 宿主机已安装 Docker 和 Docker Compose。
- 宿主机可以访问 GitHub 仓库 `kingdomwang55/baoyu-skills.git`。
- 远程分支使用 `worker-main`。

## 1. 登录宿主机

```bash
ssh 用户名@宿主机IP
```

## 2. 拉取项目

如果宿主机还没有代码：

```bash
mkdir -p ~/apps
cd ~/apps

git clone git@github.com:kingdomwang55/baoyu-skills.git
cd baoyu-skills
git checkout worker-main
```

如果宿主机已经 clone 过：

```bash
cd ~/apps/baoyu-skills
git checkout worker-main
git pull origin worker-main
```

如果宿主机没有配置 GitHub SSH key，也可以临时使用 HTTPS：

```bash
git clone https://github.com/kingdomwang55/baoyu-skills.git
```

## 3. 创建环境变量文件

在项目根目录执行：

```bash
cp apps/baoyu-worker/.env.example .env
```

编辑 `.env`：

```bash
nano .env
```

至少修改 worker 访问 token：

```bash
BAOYU_WORKER_TOKEN=换成一个很长的随机字符串
```

`BAOYU_WORKER_SHARED_DIR` 默认是 `${HOME}/docker-shared/wechat_articles`，并会挂载到容器内的 `/data/wechat_articles`。将 Markdown、图片或其他需要与 worker 共享的文件放入该宿主机目录；如需使用其他位置，可在 `.env` 中覆盖，并确保 Docker 有读取权限。

如果使用火山 Coding Plan / DeepSeek OpenAI-compatible，在 `.env` 中填写：

```bash
OPENAI_API_KEY=你的火山API_KEY
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/coding/v3
```

如果使用 Gemini / Google / OpenRouter / DashScope / 其他中转站，按 `.env` 中的分组填写对应变量。

## 4. 启动 baoyu-worker

```bash
docker compose --env-file .env -f apps/baoyu-worker/docker-compose.example.yml up --build -d
```

查看状态：

```bash
docker compose --env-file .env -f apps/baoyu-worker/docker-compose.example.yml ps
```

查看日志：

```bash
docker compose --env-file .env -f apps/baoyu-worker/docker-compose.example.yml logs -f
```

## 5. 宿主机本地验证

健康检查：

```bash
curl http://127.0.0.1:8787/health
```

预期返回：

```json
{"status":"ok"}
```

验证鉴权接口：

```bash
curl -H "Authorization: Bearer 你的BAOYU_WORKER_TOKEN" \
  http://127.0.0.1:8787/v1/skills
```

## 6. n8n 访问地址

如果 n8n 运行在 Docker 容器中，不要在 n8n 里使用 `127.0.0.1` 访问 worker；容器内的 `127.0.0.1` 指向 n8n 容器自身。

优先使用：

```text
http://host.docker.internal:8787/v1/jobs
```

如果 Linux 宿主机上 `host.docker.internal` 不通，在 n8n 的 compose 服务中加入：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

然后重启 n8n。

n8n HTTP Request 节点配置：

```text
Method: POST
URL: http://host.docker.internal:8787/v1/jobs
Header:
  Authorization: Bearer 你的BAOYU_WORKER_TOKEN
  Content-Type: application/json
```

Body 示例：

```json
{
  "skill": "baoyu-url-to-markdown",
  "operation": "convert",
  "input": {
    "url": "https://example.com",
    "format": "markdown",
    "headless": true
  }
}
```

## 7. 后续更新

远程 `worker-main` 有新提交后，在宿主机执行：

```bash
cd ~/apps/baoyu-skills
git pull origin worker-main
docker compose --env-file .env -f apps/baoyu-worker/docker-compose.example.yml up --build -d
```

## 8. 常见问题

### n8n 访问 `127.0.0.1:8787` 不通

n8n 如果在 Docker 容器里，`127.0.0.1` 是 n8n 容器自身。请改用 `host.docker.internal`，或把 n8n 和 `baoyu-worker` 放到同一个 Docker network 后使用服务名访问。

### `/v1/skills` 返回 401

请求缺少 Bearer token。添加请求头：

```text
Authorization: Bearer 你的BAOYU_WORKER_TOKEN
```

### 修改 `.env` 后没有生效

重新创建容器：

```bash
docker compose --env-file .env -f apps/baoyu-worker/docker-compose.example.yml up --build -d
```
