#!/usr/bin/env node
/**
 * megan-session-daemon.js — Lightweight session registry for multi-instance Crush
 *
 * Runs as a singleton background process, listening on a Unix domain socket.
 * Each Crush instance registers on start, sends heartbeats, posts activity
 * updates, and queries sibling sessions.
 *
 * Protocol: newline-delimited JSON over Unix socket
 *
 * State is held in-memory with optional SQLite persistence for crash recovery.
 * Stale sessions (no heartbeat for 30s) are automatically reaped.
 */

const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

// ─── Config ──────────────────────────────────────────────────────────────────

const STATE_DIR = path.join(os.homedir(), ".config", "crush", "sessions");
const SOCKET_PATH = path.join(STATE_DIR, "megan-daemon.sock");
const PID_FILE = path.join(STATE_DIR, "daemon.pid");
const STATE_FILE = path.join(STATE_DIR, "sessions.json");
const LOG_FILE = path.join(STATE_DIR, "daemon.log");

const HEARTBEAT_TIMEOUT_MS = 60_000;
const REAP_INTERVAL_MS = 10_000;
const PERSIST_INTERVAL_MS = 5_000;

// ─── Logging ─────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function log(level, msg) {
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
  if (process.env.MEGAN_DAEMON_VERBOSE) {
    process.stderr.write(line);
  }
}

// ─── Session Store ───────────────────────────────────────────────────────────

const sessions = new Map();

/**
 * Session shape:
 * {
 *   id: string,           // UUID
 *   pid: number,          // Crush process PID
 *   cwd: string,          // Working directory
 *   project: string,      // Project name (basename of cwd)
 *   startedAt: string,    // ISO timestamp
 *   lastHeartbeat: string,// ISO timestamp
 *   status: string,       // "active" | "idle" | "busy" | "dead"
 *   currentTask: string,  // Human-readable description of current work
 *   toolsInUse: string[], // Currently executing tools
 *   history: [],          // Recent activity entries (last 20)
 *   labels: {},           // Arbitrary key-value metadata
 * }
 */

function createSession({ pid, cwd, labels = {} }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const session = {
    id,
    pid: pid || process.pid,
    cwd: cwd || process.cwd(),
    project: path.basename(cwd || process.cwd()),
    startedAt: now,
    lastHeartbeat: now,
    status: "active",
    currentTask: "",
    toolsInUse: [],
    history: [],
    labels: labels || {},
  };
  sessions.set(id, session);
  log("info", `Session registered: ${id} (pid=${session.pid}, project=${session.project})`);
  persistState();
  broadcastEvent("session_registered", { session });
  return session;
}

function heartbeat(id, update = {}) {
  const session = sessions.get(id);
  if (!session) return null;

  session.lastHeartbeat = new Date().toISOString();
  if (update.status) session.status = update.status;
  if (update.currentTask !== undefined) session.currentTask = update.currentTask;
  if (update.toolsInUse) session.toolsInUse = update.toolsInUse;
  if (update.labels) Object.assign(session.labels, update.labels);

  if (update.activity) {
    session.history.push({
      timestamp: new Date().toISOString(),
      ...update.activity,
    });
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
  }

  return session;
}

function deregisterSession(id) {
  const session = sessions.get(id);
  if (!session) return false;
  sessions.delete(id);
  log("info", `Session deregistered: ${id}`);
  persistState();
  broadcastEvent("session_deregistered", { id });
  return true;
}

function listSessions(excludeId = null) {
  const result = [];
  for (const [id, session] of sessions) {
    if (id !== excludeId) {
      result.push({ ...session });
    }
  }
  return result;
}

function getSession(id) {
  return sessions.get(id) || null;
}

// ─── Message Bus ─────────────────────────────────────────────────────────────

const messageQueue = new Map(); // sessionId -> [{from, message, timestamp}]

function sendMessage(fromId, toId, message) {
  if (!sessions.has(toId)) return { error: "target_session_not_found" };
  if (!messageQueue.has(toId)) messageQueue.set(toId, []);
  const entry = {
    from: fromId,
    fromProject: sessions.get(fromId)?.project || "unknown",
    message,
    timestamp: new Date().toISOString(),
  };
  messageQueue.get(toId).push(entry);
  log("info", `Message: ${fromId} → ${toId}: ${message.slice(0, 80)}`);
  return { sent: true };
}

function getMessages(sessionId) {
  const msgs = messageQueue.get(sessionId) || [];
  messageQueue.set(sessionId, []);
  return msgs;
}

// ─── Event Subscribers (for live-watching clients) ───────────────────────────

const subscribers = new Set();

function broadcastEvent(event, data) {
  const payload = JSON.stringify({ type: "event", event, data }) + "\n";
  for (const socket of subscribers) {
    try {
      socket.write(payload);
    } catch {
      subscribers.delete(socket);
    }
  }
}

// ─── Reaper ──────────────────────────────────────────────────────────────────

function reapStaleSessions() {
  const now = Date.now();
  const reaped = [];
  for (const [id, session] of sessions) {
    const lastBeat = new Date(session.lastHeartbeat).getTime();
    if (now - lastBeat > HEARTBEAT_TIMEOUT_MS) {
      // Double-check if PID is still alive
      try {
        process.kill(session.pid, 0);
      } catch {
        reaped.push(id);
      }
    }
  }
  for (const id of reaped) {
    log("warn", `Reaping stale session: ${id} (pid=${sessions.get(id)?.pid})`);
    sessions.delete(id);
    broadcastEvent("session_reaped", { id });
  }
  if (reaped.length > 0) persistState();
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function persistState() {
  try {
    const data = {};
    for (const [id, session] of sessions) {
      data[id] = session;
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    log("error", `Failed to persist state: ${e.message}`);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      for (const [id, session] of Object.entries(data)) {
        // Only restore if PID is still alive
        try {
          process.kill(session.pid, 0);
          sessions.set(id, session);
        } catch {
          log("info", `Skipping dead session from state: ${id} (pid=${session.pid})`);
        }
      }
      log("info", `Loaded ${sessions.size} sessions from disk`);
    }
  } catch (e) {
    log("error", `Failed to load state: ${e.message}`);
  }
}

// ─── Request Handler ─────────────────────────────────────────────────────────

function handleRequest(req) {
  switch (req.method) {
    case "register":
      return { result: createSession(req.params || {}) };

    case "heartbeat":
      return { result: heartbeat(req.params.id, req.params.update || {}) };

    case "deregister":
      return { result: deregisterSession(req.params.id) };

    case "list":
      return { result: listSessions(req.params?.excludeId) };

    case "get":
      return { result: getSession(req.params.id) };

    case "send_message":
      return { result: sendMessage(req.params.fromId, req.params.toId, req.params.message) };

    case "get_messages":
      return { result: getMessages(req.params.sessionId) };

    case "ping":
      return { result: { pong: true, sessions: sessions.size, uptime: process.uptime() } };

    case "status":
      return {
        result: {
          sessions: sessions.size,
          uptime: process.uptime(),
          pid: process.pid,
          socketPath: SOCKET_PATH,
          allSessions: listSessions(),
        },
      };

    default:
      return { error: `Unknown method: ${req.method}` };
  }
}

// ─── Socket Server ───────────────────────────────────────────────────────────

function startServer() {
  ensureDir(STATE_DIR);

  // Clean up stale socket
  if (fs.existsSync(SOCKET_PATH)) {
    try {
      const client = net.createConnection(SOCKET_PATH);
      client.on("connect", () => {
        console.error(`Daemon already running on ${SOCKET_PATH}`);
        client.destroy();
        process.exit(1);
      });
      client.on("error", () => {
        // Stale socket, remove it
        fs.unlinkSync(SOCKET_PATH);
        startListening();
      });
      // Timeout for connection attempt
      setTimeout(() => {
        client.destroy();
        try { fs.unlinkSync(SOCKET_PATH); } catch {}
        startListening();
      }, 1000);
    } catch {
      try { fs.unlinkSync(SOCKET_PATH); } catch {}
      startListening();
    }
  } else {
    startListening();
  }
}

function startListening() {
  loadState();

  const server = net.createServer((socket) => {
    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let lines = buffer.split("\n");
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const req = JSON.parse(line);

          // Special: subscribe to live events
          if (req.method === "subscribe") {
            subscribers.add(socket);
            socket.write(JSON.stringify({ result: { subscribed: true } }) + "\n");
            continue;
          }

          const response = handleRequest(req);
          socket.write(JSON.stringify(response) + "\n");
        } catch (e) {
          socket.write(JSON.stringify({ error: `Parse error: ${e.message}` }) + "\n");
        }
      }
    });

    socket.on("error", () => {
      subscribers.delete(socket);
    });

    socket.on("close", () => {
      subscribers.delete(socket);
    });
  });

  server.listen(SOCKET_PATH, () => {
    // Write PID file
    fs.writeFileSync(PID_FILE, String(process.pid));
    log("info", `Daemon started on ${SOCKET_PATH} (pid=${process.pid})`);
    console.log(`Megan session daemon running (pid=${process.pid}, socket=${SOCKET_PATH})`);
  });

  server.on("error", (err) => {
    log("error", `Server error: ${err.message}`);
    console.error(`Failed to start daemon: ${err.message}`);
    process.exit(1);
  });

  // Periodic tasks
  setInterval(reapStaleSessions, REAP_INTERVAL_MS);
  setInterval(persistState, PERSIST_INTERVAL_MS);

  // Graceful shutdown
  function shutdown() {
    log("info", "Daemon shutting down");
    try { fs.unlinkSync(SOCKET_PATH); } catch {}
    try { fs.unlinkSync(PID_FILE); } catch {}
    persistState();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGHUP", shutdown);
}

// ─── CLI entry ───────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes("--stop")) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
      process.kill(pid, "SIGTERM");
      console.log(`Daemon stopped (pid=${pid})`);
    } catch (e) {
      console.error("Daemon not running or PID file missing");
    }
    process.exit(0);
  }

  if (args.includes("--status")) {
    const client = net.createConnection(SOCKET_PATH);
    client.on("connect", () => {
      client.write(JSON.stringify({ method: "status" }) + "\n");
    });
    client.on("data", (data) => {
      const resp = JSON.parse(data.toString().trim());
      console.log(JSON.stringify(resp.result, null, 2));
      client.destroy();
    });
    client.on("error", () => {
      console.error("Daemon not running");
      process.exit(1);
    });
    return;
  }

  startServer();
}

module.exports = { SOCKET_PATH, STATE_DIR };
