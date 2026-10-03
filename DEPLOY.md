# Put Context online (about 30 minutes, all in dashboards)

You end with a password protected web address where you can ask questions, see cited answers, browse the evidence graph and approve decisions. It starts in **replay mode** (no AI model) and switches to the **live model** the moment you add an Anthropic API key.

## 1. Supabase (the database), 5 minutes
1. supabase.com, New project. Save the database password.
2. Left menu, SQL Editor, New query. Open `dataset/supabase_1_ops.sql`, paste everything, Run. Then do the same with `dataset/supabase_2_docs_kobo.sql`.
3. Check: Table Editor, choose schema `ops`, table `projects` should show 9 rows.
4. Click **Connect** (top bar) and copy the **Session pooler** connection string, with your password filled in. Use the pooler string, not the direct one: as far as I know the direct one is IPv6 only on the free plan, which Render may not reach. Check Supabase's Connect dialog.

## 2. GitHub, 5 minutes
1. New private repository called `context`.
2. Add file, Upload files. Drag in everything from inside this folder (not the zip itself). Commit.
   If GitHub refuses a large drop, upload folder by folder.

## 3. Render (the app), 10 minutes
1. Render dashboard, New, **Web Services**, connect the `context` repo.
2. Settings: Runtime **Node**, Build command `npm ci`, Start command `npm start`, Health check path `/healthz`.
3. Environment variables:

| Key | Value |
|---|---|
| NODE_VERSION | 22 |
| HOST | 0.0.0.0 |
| CONTEXT_EPHEMERAL | 1 |
| DATABASE_SSL | no-verify |
| DATABASE_URL | the Session pooler string from step 1 |
| DEMO_PASSWORD | a long passphrase you choose |
| ANTHROPIC_API_KEY | optional, add later for the live model |
| KOBO_TOKEN | any long random string (used when Zetaris reads the survey API) |

4. Create Web Service. The first deploy takes a few minutes. Open the address Render gives you.

## 4. Check it works
- `/healthz` shows `{"ok":true}`.
- The page asks for your password. After login the top right shows REPLAY (amber) or LIVE (green).
- Click the first suggested question. The investigation timeline fills in, then a cited answer appears, and 3 decisions are pending.
- Click a violet citation: the source paragraph opens on the right.
- Open Evidence and graph, then Decisions, and approve one.

## If something fails
- **Password authentication failed or timeout**: wrong DATABASE_URL. Re-copy the Session pooler string and fill in your password.
- **SSL error**: confirm DATABASE_SSL is `no-verify`.
- **Page loads but everything is empty**: the SQL files did not run to the end. Re-run file 1, then file 2.
- **Slow first load after a quiet period**: free Render services sleep and need about a minute to wake. Open the address a few minutes before any demo, or choose an always-on plan (check current pricing).

## Cost control
- Anyone with the password can spend your Anthropic credits. Limits are 30 questions per hour per session and 200 per day (MAX_ASKS_PER_HOUR, MAX_ASKS_PER_DAY). Also set a monthly spend limit in the Anthropic console.
- AWS: the Zetaris setup runs a network gateway that AWS bills by the hour even with no cluster. When the hackathon is over, delete the CloudFormation stack in AWS.

## Choosing the language model
The app picks its model from environment variables in Render. Set one option:
- **Claude:** `ANTHROPIC_API_KEY` (needs prepaid credits at platform.claude.com).
- **Any OpenAI-compatible provider:** `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` together. Hackathon sponsors NVIDIA and xAI offer such APIs, and credits are often provided to participants. As far as I know the base URLs are `https://integrate.api.nvidia.com/v1` (NVIDIA) and `https://api.x.ai/v1` (xAI): confirm both, and the exact model names, in each provider's documentation.
- **Nothing:** the app runs in scripted replay mode and says so on screen.
After saving the variables, Render redeploys by itself. The top right badge turns green and shows the model name.

## Updating the app later
Upload the changed files to the same GitHub repo (or drag the whole folder in again: GitHub only records what changed) and commit. Render redeploys by itself in a minute or two.
