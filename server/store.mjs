import pg from "pg";
import { cases } from "../src/fixtures.ts";
import { runCase } from "../src/engine.ts";

let pool;
export function databaseReady() { return Boolean(process.env.DATABASE_URL); }
export function db() {
  if (!databaseReady()) throw new Error("DATABASE_URL is not configured.");
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return pool;
}

export async function initialize() {
  if (!databaseReady()) return;
  await db().query(`
    CREATE TABLE IF NOT EXISTS evidence (
      id text PRIMARY KEY,
      case_id text,
      kind text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      source_url text,
      source_date timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      embedding real[],
      embedding_model text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS evidence_case_idx ON evidence(case_id);
    CREATE TABLE IF NOT EXISTS drafts (
      id uuid PRIMARY KEY,
      case_id text NOT NULL,
      kind text NOT NULL,
      recipient text NOT NULL,
      subject text NOT NULL,
      body text NOT NULL,
      status text NOT NULL DEFAULT 'draft',
      sent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  for (const item of cases) {
    const result = runCase(item, "contract");
    const records = [
      ...item.clauses.map((clause) => ({ id: `clause:${item.id}:${clause.id}`, kind: "clause", title: clause.cite, body: clause.text })),
      ...item.outages.map((outage) => ({ id: `notice:${item.id}:${outage.id}`, kind: "notice", title: outage.reference, body: outage.note })),
      ...item.events.map((event) => ({ id: `event:${item.id}:${event.id}`, kind: "status event", title: `${event.turbineId} ${event.code}`,
        body: `${event.kind} from ${new Date(event.start).toISOString()} to ${new Date(event.end).toISOString()}. ${event.message}` })),
      ...result.findings.map((finding) => ({ id: `finding:${finding.id}`, kind: "finding", title: finding.title, body: `${finding.narrative} ${finding.hours} hours. Amount in dispute £${finding.centralGbp.toFixed(2)}. ${finding.clause}.` })),
      { id: `case:${item.id}`, kind: "case", title: `${item.name} ${item.quarterLabel}`, body: `Contract availability ${(result.availability * 100).toFixed(4)}%. OEM availability ${(result.oemAvailability * 100).toFixed(4)}%. Amount in dispute £${result.varianceDamagesGbp.toFixed(2)}. ${item.events.length} status events. ${item.outages.length} outage notices.` },
    ];
    for (const record of records) {
      await db().query(`INSERT INTO evidence (id, case_id, kind, title, body, metadata)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, body=EXCLUDED.body`,
        [record.id, item.id, record.kind, record.title, record.body, JSON.stringify({ fixture: true })]);
    }
  }
}

export async function evidenceFor(caseId, limit = 80) {
  const result = await db().query(`SELECT id, case_id, kind, title, body, source_url, source_date, metadata, embedding, embedding_model
    FROM evidence WHERE ($1::text IS NULL OR case_id=$1 OR case_id IS NULL)
    ORDER BY CASE kind WHEN 'finding' THEN 0 WHEN 'clause' THEN 1 ELSE 2 END, created_at DESC LIMIT $2`, [caseId, limit]);
  return result.rows;
}

export async function upsertEvidence(record) {
  await db().query(`INSERT INTO evidence (id, case_id, kind, title, body, source_url, source_date, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (id) DO NOTHING`, [record.id, record.caseId, record.kind, record.title, record.body, record.url, record.date, JSON.stringify(record.metadata ?? {})]);
}

export async function saveEmbedding(id, model, embedding) {
  await db().query("UPDATE evidence SET embedding=$2, embedding_model=$3 WHERE id=$1", [id, embedding, model]);
}

export async function createDraft(draft) {
  const result = await db().query(`INSERT INTO drafts (id, case_id, kind, recipient, subject, body)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [draft.id, draft.caseId, draft.kind, draft.recipient, draft.subject, draft.body]);
  return result.rows[0];
}

export async function updateDraft(id, patch) {
  const result = await db().query(`UPDATE drafts SET recipient=$2, subject=$3, body=$4
    WHERE id=$1 AND status='draft' RETURNING *`, [id, patch.recipient, patch.subject, patch.body]);
  return result.rows[0];
}

export async function reserveDraft(id) {
  return (await db().query("UPDATE drafts SET status='sending' WHERE id=$1 AND status='draft' RETURNING *", [id])).rows[0];
}

export async function releaseDraft(id) {
  await db().query("UPDATE drafts SET status='draft' WHERE id=$1 AND status='sending'", [id]);
}

export async function markSent(id) {
  await db().query("UPDATE drafts SET status='sent', sent_at=now() WHERE id=$1 AND status='sending'", [id]);
}
