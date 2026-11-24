# Clause to Claim

A revenue assurance workspace for comparing wind farm availability statements with contract rules. The calculation engine remains deterministic; AI reads its results and the saved evidence.

## Run locally

1. `npm ci`
2. Copy `.env.example` to `.env` and set the services you want to use.
3. Run `npm run server` in one terminal and `npm run dev` in another.
4. Open the Vite URL, or run `npm run build` and open `http://127.0.0.1:3001` from the server.

The server accepts requests only on localhost by default. Set `APP_ACCESS_TOKEN` before exposing it on another interface. Enter that token under **Workspace access** in the UI. Provider keys and the send approval secret stay on the server. `GMAIL_APP_PASSWORD` is not used; the Gmail API uses the OAuth client and refresh token.

## What is connected

| Workflow | Service | Behaviour |
| --- | --- | --- |
| Evidence intake | Gmail API + Neon Postgres | Fetches up to 20 matching messages per sync. Saves text bodies and extracts selectable text from PDF and text attachments. Matching site names assign records to a case; ambiguous records remain unassigned. |
| Case questions | Claude + Neon Postgres | Gives the model verified engine results and saved evidence, then shows the evidence set alongside the answer. Case figures are never calculated by the model. |
| Related cases | Voyage + Neon Postgres | Embeds case findings and compares them with other saved cases. Similarity is a retrieval aid, not a finding of fact. |
| Claim and alert drafts | Claude + Gmail API | Saves editable drafts in Postgres. An email is sent only from the review screen with the `SEND_EMAIL_SECRET`. |

The sample Glen Moor and Site P records are fictional and seed the evidence table when `DATABASE_URL` is configured. Gmail ingestion needs a refresh token granted both `gmail.readonly` and `gmail.send` scopes, or an equivalent broader scope. `ALERT_EMAIL` supplies the initial recipient for alert drafts. Scanned PDFs need OCR outside the current extractor; unsupported attachments remain linked to their source email.

## Database

Tables are created on server startup: `evidence` stores text, source links, and optional embeddings; `drafts` stores email review state. The app does not send mail during startup or ingestion. `npm run build` and `npm test` verify the frontend and contract engine.
