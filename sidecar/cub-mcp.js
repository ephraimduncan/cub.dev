#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const STATE_DIR = path.join(os.homedir(), ".cub");
const STATE_PATH = path.join(STATE_DIR, "review-bridge.json");
const DB_PATH = path.join(STATE_DIR, "reviews.db");

const reviewCommentSchema = z.object({
  file_path: z.string().min(1),
  line_start: z.number().int().nonnegative(),
  line_end: z.number().int().nonnegative(),
  comment: z.string().min(1),
  action_type: z.enum(["change-request", "question", "nit"]),
});

// ── Shared helpers ──────────────────────────────────────────────────

function readJson(body) {
  return new Promise((resolve, reject) => {
    let data = "";
    body.setEncoding("utf8");
    body.on("data", (chunk) => (data += chunk));
    body.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    body.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readServerInfo() {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function writeServerInfo(info) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(info), "utf8");
}

async function removeServerInfoIfOwned(pid) {
  const info = await readServerInfo().catch(() => null);
  if (info?.pid === pid) {
    await fs.rm(STATE_PATH, { force: true });
  }
}

// ── Database ────────────────────────────────────────────────────────

function initDatabase() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id          TEXT PRIMARY KEY,
      status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'in_progress', 'resolved')),
      comments    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      resolved_at TEXT
    )
  `);
  return db;
}

// ── HTTP Server mode ────────────────────────────────────────────────

async function startServer() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const db = initDatabase();

  const insertReview = db.prepare(
    "INSERT INTO reviews (id, comments) VALUES (?, ?)",
  );
  const getPending = db.prepare(
    "SELECT * FROM reviews WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1",
  );
  const markInProgress = db.prepare(
    "UPDATE reviews SET status = 'in_progress', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  );
  const markResolved = db.prepare(
    "UPDATE reviews SET status = 'resolved', resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  );

  const claimPending = db.transaction(() => {
    const row = getPending.get();
    if (!row) return null;
    markInProgress.run(row.id);
    return row;
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && req.url === "/reviews") {
        const body = await readJson(req);
        const comments = reviewCommentSchema.array().min(1).parse(body.comments);
        const id = randomUUID();
        insertReview.run(id, JSON.stringify(comments));
        sendJson(res, 201, { ok: true, id, accepted_count: comments.length });
        return;
      }

      if (req.method === "GET" && req.url === "/reviews/pending") {
        const row = claimPending();
        if (!row) {
          sendJson(res, 200, { ok: true, review: null });
          return;
        }
        sendJson(res, 200, {
          ok: true,
          review: { id: row.id, status: "in_progress", comments: JSON.parse(row.comments), created_at: row.created_at },
        });
        return;
      }

      const resolveMatch = req.method === "POST" && req.url?.match(/^\/reviews\/([^/]+)\/resolve$/);
      if (resolveMatch) {
        const id = resolveMatch[1];
        const result = markResolved.run(id);
        if (result.changes === 0) {
          sendJson(res, 404, { ok: false, error: "review not found" });
          return;
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      sendJson(res, 404, { ok: false, error: "not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(res, 400, { ok: false, error: message });
    }
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("server failed to bind a port");
  }

  await writeServerInfo({
    port: address.port,
    pid: process.pid,
    started_at: new Date().toISOString(),
  });

  const cleanup = async () => {
    server.close();
    db.close();
    await removeServerInfoIfOwned(process.pid);
  };

  process.on("SIGINT", () => void cleanup().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void cleanup().finally(() => process.exit(0)));
  process.on("exit", () => {
    try { db.close(); } catch {}
    void removeServerInfoIfOwned(process.pid);
  });

  await new Promise(() => {});
}

// ── MCP mode (HTTP client to server) ────────────────────────────────

async function httpRequest(method, path, body) {
  const info = await readServerInfo();
  if (!info) throw new Error("Cub review server is not running");

  const url = `http://127.0.0.1:${info.port}${path}`;
  const options = { method, headers: {} };

  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    options.headers["content-type"] = "application/json";
    options.headers["content-length"] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error("invalid response from review server"));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`review server unreachable: ${err.message}`)));
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("review server request timed out"));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function startMcpServer() {
  const server = new McpServer({
    name: "cub",
    version: "0.1.0",
  });

  server.registerTool(
    "get_review",
    {
      description:
        "Fetch code review comments from Cub and apply them. " +
        "Each comment targets a specific file and line range. " +
        "You MUST read each referenced file, understand the comment, and make the requested change. " +
        "Action types: change-request (must fix), question (answer in code or comment), nit (minor improvement). " +
        "After applying all changes, call resolve_review with the review_id to mark it done.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await httpRequest("GET", "/reviews/pending");
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to fetch review: ${result.error}` }], isError: true };
        }

        if (!result.review) {
          return { content: [{ type: "text", text: "No review comments pending in Cub." }] };
        }

        const { id, comments } = result.review;
        const instructions = comments
          .map((c, i) => {
            const loc = c.line_start === c.line_end ? `line ${c.line_start}` : `lines ${c.line_start}-${c.line_end}`;
            return `${i + 1}. [${c.action_type}] ${c.file_path} (${loc}): ${c.comment}`;
          })
          .join("\n");

        return {
          content: [
            {
              type: "text",
              text:
                `Cub code review (id: ${id}) — ${comments.length} comment(s) to address:\n\n` +
                `${instructions}\n\n` +
                `For each comment: read the file, apply the change, and move to the next.\n` +
                `When done, call resolve_review with review_id "${id}".`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Failed to read Cub review: ${message}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "resolve_review",
    {
      description: "Mark a Cub code review as resolved after applying all changes.",
      inputSchema: {
        review_id: z.string().describe("The review ID returned by get_review"),
      },
    },
    async ({ review_id }) => {
      try {
        const result = await httpRequest("POST", `/reviews/${review_id}/resolve`);
        if (!result.ok) {
          return { content: [{ type: "text", text: `Failed to resolve review: ${result.error}` }], isError: true };
        }
        return { content: [{ type: "text", text: `Review ${review_id} marked as resolved.` }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: `Failed to resolve review: ${message}` }], isError: true };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ── Entry point ─────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  const [mode] = argv;

  if (mode === "server") {
    await startServer();
    return;
  }

  if (mode === "mcp") {
    await startMcpServer();
    return;
  }

  console.error("Usage: node sidecar/cub-mcp.js <server|mcp>");
  process.exit(1);
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Cub MCP sidecar failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
