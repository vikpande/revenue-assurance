import test from "node:test";
import assert from "node:assert/strict";
import { askClaude, embed, listGmailEvidence, sendGmail } from "./providers.mjs";

test("Claude request keeps the key server-side and reads text blocks", async () => {
  const original = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(options.headers.Authorization, "Bearer test-key");
      assert.equal(options.headers["anthropic-version"], "2026-10-21");
      assert.equal(JSON.parse(options.body).messages[0].content, "Question");
      return Response.json({ content: [{ type: "text", text: "Grounded answer" }] });
    };
    assert.equal(await askClaude("Instructions", "Question"), "Grounded answer");
  } finally { globalThis.fetch = original; delete process.env.ANTHROPIC_API_KEY; }
});

test("Voyage embeddings are returned in input order", async () => {
  const original = globalThis.fetch;
  process.env.VOYAGE_API_KEY = "test-key";
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).input_type, "document");
      return Response.json({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] });
    };
    assert.deepEqual((await embed(["a", "b"])).vectors, [[1, 0], [0, 1]]);
  } finally { globalThis.fetch = original; delete process.env.VOYAGE_API_KEY; }
});

test("Gmail intake reads message body and text attachment; send uses reviewed message", async () => {
  const original = globalThis.fetch;
  process.env.GMAIL_CLIENT_ID = "client";
  process.env.GMAIL_CLIENT_SECRET = "secret";
  process.env.GMAIL_REFRESH_TOKEN = "refresh";
  process.env.GMAIL_USER = "sender@example.com";
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/token")) return Response.json({ access_token: "access" });
      if (url.includes("messages?")) return Response.json({ messages: [{ id: "msg1", threadId: "thread1" }] });
      if (url.includes("messages/msg1?")) return Response.json({ id: "msg1", threadId: "thread1", internalDate: "1700000000000", snippet: "snippet", payload: {
        headers: [{ name: "Subject", value: "Outage notice" }, { name: "From", value: "dno@example.com" }],
        parts: [{ mimeType: "text/plain", body: { data: Buffer.from("Notice body").toString("base64url") } },
          { mimeType: "text/plain", filename: "notice.txt", body: { size: 12, data: Buffer.from("Attachment").toString("base64url") } }],
      } });
      if (url.endsWith("messages/send")) return Response.json({ id: "sent1" });
      throw new Error(`Unexpected URL ${url}`);
    };
    const messages = await listGmailEvidence("outage", 1);
    assert.equal(messages[0].body, "Notice body");
    assert.equal(messages[0].attachments[0].body, "Attachment");
    await sendGmail("owner@example.com", "Review", "Approved text");
    const sendCall = calls.find((call) => call.url.endsWith("messages/send"));
    const raw = Buffer.from(JSON.parse(sendCall.options.body).raw, "base64url").toString("utf8");
    assert.match(raw, /To: owner@example.com/);
    assert.match(raw, /Approved text/);
  } finally {
    globalThis.fetch = original;
    for (const key of ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "GMAIL_USER"]) delete process.env[key];
  }
});
