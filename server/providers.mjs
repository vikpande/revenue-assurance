import { Buffer } from "node:buffer";

function required(key) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured.`);
  return value;
}

async function jsonResponse(response, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${label}: ${data.error?.message ?? data.error ?? response.statusText}`);
  return data;
}

export async function askClaude(system, prompt, maxTokens = 1200) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${required("ANTHROPIC_API_KEY")}`, "anthropic-version": "2026-10-21", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: maxTokens,
      system: [{ type: "text", text: system }], messages: [{ role: "user", content: prompt }] }),
  });
  const data = await jsonResponse(response, "Claude request failed");
  return (data.content ?? []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
}

export async function embed(texts, inputType = "document") {
  const model = process.env.VOYAGE_MODEL || "voyage-4";
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${required("VOYAGE_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: texts, input_type: inputType }),
  });
  const data = await jsonResponse(response, "Voyage request failed");
  return { model, vectors: data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding) };
}

async function gmailToken() {
  const body = new URLSearchParams({ client_id: required("GMAIL_CLIENT_ID"), client_secret: required("GMAIL_CLIENT_SECRET"), refresh_token: required("GMAIL_REFRESH_TOKEN"), grant_type: "refresh_token" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const data = await jsonResponse(response, "Gmail authorization failed");
  return data.access_token;
}

async function gmail(path, options = {}) {
  const token = await gmailToken();
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  return jsonResponse(response, "Gmail request failed");
}

function decoded(data) { return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }
function plainBody(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return decoded(part.body.data);
  for (const child of part.parts ?? []) {
    const text = plainBody(child);
    if (text) return text;
  }
  return "";
}

function attachmentParts(part) {
  if (!part) return [];
  return [...(part.filename ? [part] : []), ...(part.parts ?? []).flatMap(attachmentParts)];
}

async function extractAttachment(messageId, part) {
  const filename = part.filename || "attachment";
  const size = part.body?.size ?? 0;
  if (size > 10_000_000) return { filename, body: "Attachment exceeds the 10 MB extraction limit.", extracted: false };
  let data = part.body?.data;
  if (!data && part.body?.attachmentId) {
    data = (await gmail(`messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`)).data;
  }
  if (!data) return { filename, body: "Attachment could not be read.", extracted: false };
  const bytes = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (part.mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    try {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
      const pages = [];
      for (let number = 1; number <= Math.min(pdf.numPages, 50); number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => item.str || "").join(" "));
      }
      await pdf.destroy();
      const body = pages.join("\n\n").slice(0, 100_000);
      return { filename, body: body || "PDF has no selectable text; review the original attachment.", extracted: Boolean(body) };
    } catch {
      return { filename, body: "PDF text extraction failed; review the original attachment.", extracted: false };
    }
  }
  if (part.mimeType?.startsWith("text/") || /\.(txt|csv|md)$/i.test(filename)) {
    return { filename, body: bytes.toString("utf8").slice(0, 100_000), extracted: true };
  }
  return { filename, body: "This attachment type needs manual review in Gmail.", extracted: false };
}

export async function listGmailEvidence(query, maxResults = 20) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const listed = await gmail(`messages?${params}`);
  const out = [];
  for (const item of listed.messages ?? []) {
    const message = await gmail(`messages/${encodeURIComponent(item.id)}?format=full`);
    const headers = Object.fromEntries((message.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
    const attachments = [];
    for (const part of attachmentParts(message.payload)) attachments.push(await extractAttachment(message.id, part));
    out.push({ id: message.id, threadId: message.threadId, subject: headers.subject || "Untitled email", from: headers.from || "", date: new Date(Number(message.internalDate)).toISOString(),
      body: (plainBody(message.payload) || message.snippet || "").slice(0, 30_000), attachments });
  }
  return out;
}

export async function sendGmail(recipient, subject, body) {
  const sender = required("GMAIL_USER");
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const raw = `From: ${sender}\r\nTo: ${recipient}\r\nSubject: ${encodedSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`;
  return gmail("messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(raw).toString("base64url") }) });
}
