# Transfer to a New Computer

This project is stored in GitHub and deployed on Cloudflare Workers.
Do not commit `.env` or real API keys.

## 1. Install local tools

Install Node.js LTS, then verify:

```bash
node -v
npm -v
```

Install or use Wrangler:

```bash
npx wrangler login
```

## 2. Clone the project

```bash
cd ~/Documents
git clone https://github.com/hfr9060-jpg/mkt_topic_creator-automationv.git
cd mkt_topic_creator-automationv
npm install
```

## 3. Create local env file

```bash
cp .env.example .env
```

Fill local test values:

```env
WORKER_SECRET=
DEEPSEEK_API_KEY=
TAVILY_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

Cloudflare production secrets are stored in Cloudflare Workers and do not need
to be committed to GitHub.

## 4. Verify locally

```bash
npm run typecheck
```

Optional Telegram push test:

```bash
npm run test:telegram
```

## 5. Deploy Worker

```bash
npm run deploy
```

## 6. Verify automation

Open GitHub Actions for the repository and run:

```text
Weekly Report -> Run workflow -> main
```

Expected flow:

```text
GitHub Actions -> Cloudflare Worker -> Tavily -> DeepSeek -> D1 -> Telegram
```

## Cloudflare secrets required

Check with:

```bash
npx wrangler secret list
```

Required names:

```text
WORKER_SECRET
DEEPSEEK_API_KEY
TAVILY_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

If a secret is missing:

```bash
npx wrangler secret put SECRET_NAME
```
