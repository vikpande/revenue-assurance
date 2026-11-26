import { useEffect, useState, type FormEvent } from "react";
import { cases } from "./fixtures";
import { siteHref } from "./route";
import { runCase } from "./engine";

type Source = { id: string; caseId: string | null; title: string; kind: string; url: string | null };
type Message = { role: "user" | "assistant"; text: string; sources?: Source[] };
type Match = { id: string; caseId: string; title: string; kind: string; excerpt: string; score: number };
type Draft = { id: string; case_id: string; kind: string; recipient: string; subject: string; body: string; status: string };

const suggestions = [
  "Which hours changed the claim?",
  "Where is the grid outage evidence incomplete?",
  "What should I review before sending?",
];

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark${large ? " brand-mark-large" : ""}`} aria-hidden="true">RA</span>
  );
}

export function WorkspaceScreen() {
  const [caseId, setCaseId] = useState(cases[1]?.id ?? cases[0].id);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState(() => sessionStorage.getItem("c2c-access-token") ?? "");
  const [matches, setMatches] = useState<Match[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sendSecret, setSendSecret] = useState("");
  const activeCase = cases.find((item) => item.id === caseId) ?? cases[0];
  const currentFindings = runCase(activeCase, "contract").findings;

  async function call<T>(path: string, data?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    const response = await fetch(path, { method: data ? "POST" : "GET", headers: {
      ...(data ? { "content-type": "application/json" } : {}),
      ...(accessToken ? { "x-app-access-token": accessToken } : {}), ...extraHeaders,
    }, ...(data ? { body: JSON.stringify(data) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The request failed.");
    return result as T;
  }

  useEffect(() => {
    fetch("/api/status", { headers: accessToken ? { "x-app-access-token": accessToken } : {} })
      .then(async (response) => { if (!response.ok) throw new Error((await response.json()).error); return response.json(); })
      .then(() => setError("")).catch((cause) => setError(cause.message || "Start the assurance server to use the workspace."));
  }, [accessToken]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The request failed."); }
    finally { setBusy(""); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setQuestion("");
    setMessages((previous) => [...previous, { role: "user", text }]);
    await run("answer", async () => {
      const result = await call<{ answer: string; sources: Source[] }>("/api/ask", { question: text, caseId });
      setMessages((previous) => [...previous, { role: "assistant", text: result.answer, sources: result.sources }]);
    });
  }

  async function syncInbox() {
    await run("sync", async () => {
      const result = await call<{ imported: number; message: string }>("/api/ingest", {});
      setMessages((previous) => [...previous, { role: "assistant", text: `${result.imported} email messages checked. ${result.message}` }]);
    });
  }

  async function findAnalogues() {
    await run("analogues", async () => {
      const result = await call<{ matches: Match[] }>("/api/analogues", { caseId });
      setMatches(result.matches);
    });
  }

  async function createDraft(kind: "claim" | "alert") {
    await run(kind, async () => {
      const result = await call<Draft>("/api/drafts", { caseId, kind });
      setDraft(result);
    });
  }

  async function saveDraft() {
    if (!draft) return;
    await run("save", async () => {
      const result = await call<Draft>(`/api/drafts/${draft.id}/update`, draft);
      setDraft(result);
    });
  }

  async function sendDraft() {
    if (!draft) return;
    await run("send", async () => {
      const saved = await call<Draft>(`/api/drafts/${draft.id}/update`, draft);
      await call(`/api/drafts/${draft.id}/send`, {}, { "x-send-email-secret": sendSecret });
      setDraft({ ...saved, status: "sent" });
      setSendSecret("");
    });
  }

  function saveAccessToken(value: string) {
    setAccessToken(value);
    sessionStorage.setItem("c2c-access-token", value);
    setError("");
  }

  return (
    <div className={`workspace${messages.length || draft || matches.length ? " workspace-active" : ""}`}>
      <header className="workspace-top">
        <a className="workspace-brand" href="#/"><BrandMark /> Clause to Claim</a>
        <nav aria-label="Workspace navigation"><a href="#/portfolio">Portfolio</a><a href="#/docs">How it works</a></nav>
      </header>
      <div className="workspace-core">
        <div className="workspace-intro">
          <BrandMark large />
          <h1>What would you like to uncover?</h1>
        </div>
        <p className="workspace-subtitle">Ask about a claim, compare past cases, or prepare the next review.</p>
        <form className="prompt-box" onSubmit={submit}>
          <label className="sr" htmlFor="question">Ask about the evidence</label>
          <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about the evidence in this case…" rows={3}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          <div className="prompt-footer">
            <select aria-label="Site to review" value={caseId} onChange={(event) => { setCaseId(event.target.value); setMatches([]); setDraft(null); }}>
              {cases.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.quarterLabel}</option>)}
            </select>
            <button type="submit" disabled={Boolean(busy) || !question.trim()} aria-label="Search case evidence">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="2" /><path d="m15.5 15.5 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
          </div>
        </form>
        <div className="workspace-suggestions" aria-label="Suggested questions">
          {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}
        </div>
        <div className="workspace-tools">
          <button type="button" onClick={syncInbox} disabled={Boolean(busy)}>Sync Gmail evidence</button>
          <button type="button" onClick={findAnalogues} disabled={Boolean(busy)}>Find similar cases</button>
          <button type="button" onClick={() => createDraft("claim")} disabled={Boolean(busy)}>Draft claim pack</button>
          <button type="button" onClick={() => createDraft("alert")} disabled={Boolean(busy)}>Draft alert</button>
        </div>
        {busy && <p className="workspace-feedback" role="status">{busy === "answer" ? "Reviewing case evidence…" : "Working on your request…"}</p>}
        {error && <p className="workspace-error" role="alert">{error}</p>}
        {messages.length > 0 && <section className="conversation" aria-label="Conversation">
          {messages.map((message, index) => <article className={`chat-message chat-${message.role}`} key={index}>
            <span>{message.role === "user" ? "You" : "Case assistant"}</span>
            <p>{message.text}</p>
            {message.sources && <details><summary>Evidence available ({message.sources.length})</summary><ul>
              {message.sources.map((source) => <li key={source.id}><a href={source.url || (source.caseId ? siteHref(source.caseId) : "#/portfolio")} target={source.url ? "_blank" : undefined} rel={source.url ? "noreferrer" : undefined}>{source.title}</a><small>{source.kind} · {source.id}</small></li>)}
            </ul></details>}
          </article>)}
        </section>}
        {matches.length > 0 && <section className="workspace-result" aria-labelledby="analogues-title"><h2 id="analogues-title">Related evidence</h2>
          <p>Ranked by semantic similarity. Matches are text-based leads, not confirmation that facts or contract terms are the same.</p>
          <div className="similarity-list">{matches.map((match) => {
            const sourceCase = cases.find((item) => item.id === match.caseId);
            return <article className="similarity-card" key={match.id}>
              <div className="similarity-heading">
                <a href={siteHref(match.caseId)}>{match.title}</a>
                <span className="similarity-score">{Math.round(match.score * 100)}% <small>text similarity</small></span>
              </div>
              <p>{match.excerpt}</p>
              <details className="similarity-details">
                <summary>View relationship</summary>
                <div className="similarity-graph" aria-label={`Relationship between findings in ${activeCase.name} and ${match.title} in ${sourceCase?.name ?? "another case"}`}>
                  <div className="similarity-node similarity-current">
                    <span className="similarity-node-label">Current search</span>
                    <strong>{activeCase.name}</strong>
                    <small>{currentFindings.length ? `${currentFindings.length} contract finding${currentFindings.length === 1 ? "" : "s"} · titles and narratives` : "Availability dispute · fallback search text"}</small>
                  </div>
                  <div className="similarity-edge">
                    <span>Semantic text similarity</span>
                  </div>
                  <div className="similarity-node similarity-record">
                    <span className="similarity-node-label">Matched {match.kind}</span>
                    <strong>{match.title}</strong>
                    <small>{match.excerpt}</small>
                  </div>
                  <div className="similarity-edge similarity-edge-case">
                    <span>Record belongs to</span>
                  </div>
                  <a className="similarity-node similarity-case" href={siteHref(match.caseId)}>
                    <span className="similarity-node-label">Source case</span>
                    <strong>{sourceCase?.name ?? match.caseId}</strong>
                    <small>{sourceCase?.quarterLabel ?? "Open case details"}</small>
                  </a>
                </div>
                <p className="similarity-caveat">The score measures similarity between text embeddings. It does not verify shared facts, rules, or outcomes.</p>
              </details>
            </article>;
          })}</div>
        </section>}
        {draft && <section className="workspace-result draft-editor" aria-labelledby="draft-title"><div className="draft-heading"><div><h2 id="draft-title">{draft.kind === "alert" ? "Alert draft" : "Claim pack draft"}</h2><p>Review the facts, citations, recipient, and wording before sending.</p></div><span className="pill">{draft.status}</span></div>
          <label>To<input type="email" value={draft.recipient} disabled={draft.status === "sent"} onChange={(event) => setDraft({ ...draft, recipient: event.target.value })} /></label>
          <label>Subject<input value={draft.subject} disabled={draft.status === "sent"} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} /></label>
          <label>Message<textarea rows={12} value={draft.body} disabled={draft.status === "sent"} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
          {draft.status !== "sent" && <div className="draft-actions"><button className="ghost" type="button" onClick={saveDraft} disabled={Boolean(busy)}>Save changes</button><label>Send approval secret<input type="password" autoComplete="off" value={sendSecret} onChange={(event) => setSendSecret(event.target.value)} /></label><button className="solid" type="button" onClick={sendDraft} disabled={Boolean(busy) || !sendSecret || !draft.recipient}>Review complete · send email</button></div>}
          {draft.status === "sent" && <p role="status">Sent through the connected Gmail account.</p>}
        </section>}
      </div>
      <details className="workspace-access"><summary>Workspace access</summary><label>Access token<input type="password" value={accessToken} onChange={(event) => saveAccessToken(event.target.value)} /></label></details>
    </div>
  );
}
