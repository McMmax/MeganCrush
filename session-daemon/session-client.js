/**
 * session-client.js — Client library for Crush instances to talk to the session daemon
 *
 * Provides:
 * - Auto-start daemon if not running
 * - Register/deregister sessions
 * - Heartbeat with activity updates
 * - Query sibling sessions
 * - Send/receive messages between sessions
 *
 * Performance: persistent socket, cached daemon checks, dedup registration.
 */

const net = require("net");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const STATE_DIR = path.join(os.homedir(), ".config", "crush", "sessions");
const SOCKET_PATH = path.join(STATE_DIR, "megan-daemon.sock");
const PID_FILE = path.join(STATE_DIR, "daemon.pid");
const DAEMON_SCRIPT = path.join(__dirname, "daemon.js");

const HEARTBEAT_INTERVAL_MS = 15_000;
const CONNECT_TIMEOUT_MS = 2_000;
const DAEMON_CHECK_TTL_MS = 30_000;

const DEBUG = !!(process.env.MEGAN_SESSION_DEBUG || process.env.MEGAN_DAEMON_VERBOSE);
const LOG_FILE = path.join(STATE_DIR, "client-debug.log");

function debug(msg) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
  const line = `[${ts}] [CLIENT] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  process.stderr.write(line);
}

class SessionClient {
  constructor() {
    this.sessionId = null;
    this.heartbeatTimer = null;
    this._currentTask = "";
    this._toolsInUse = [];
    this._status = "active";
    this._daemonVerifiedAt = 0;
    this._persistentSocket = null;
    this._socketReady = false;
    this._pendingRequests = new Map();
    this._requestIdCounter = 0;
    this._socketBuffer = "";
    this._connecting = false;
    this._connectPromise = null;
  }

  // ── Daemon Management ────────────────────────────────────────────────────

  isDaemonRunning() {
    try {
      if (!fs.existsSync(PID_FILE)) {
        debug("isDaemonRunning: no PID file");
        return false;
      }
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
      process.kill(pid, 0);
      debug(`isDaemonRunning: yes (pid=${pid})`);
      return true;
    } catch {
      debug("isDaemonRunning: PID exists but process dead");
      return false;
    }
  }

  async ensureDaemon() {
    const now = Date.now();
    if (now - this._daemonVerifiedAt < DAEMON_CHECK_TTL_MS) {
      debug("ensureDaemon: cached (recently verified)");
      return true;
    }

    if (this.isDaemonRunning()) {
      this._daemonVerifiedAt = now;
      debug("ensureDaemon: daemon running");
      return true;
    }

    debug("ensureDaemon: spawning daemon...");
    const started = await new Promise((resolve) => {
      const child = spawn("node", [DAEMON_SCRIPT], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });
      child.unref();

      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (fs.existsSync(SOCKET_PATH)) {
          clearInterval(check);
          debug(`ensureDaemon: socket appeared after ${attempts} attempts`);
          resolve(true);
        } else if (attempts > 20) {
          clearInterval(check);
          debug("ensureDaemon: FAILED to spawn after 20 attempts");
          resolve(false);
        }
      }, 250);
    });

    if (started) this._daemonVerifiedAt = Date.now();
    return started;
  }

  // ── Persistent Socket ───────────────────────────────────────────────────

  _ensureSocket() {
    if (this._socketReady && this._persistentSocket && !this._persistentSocket.destroyed) {
      debug("_ensureSocket: reusing existing socket");
      return Promise.resolve();
    }
    if (this._connectPromise) {
      debug("_ensureSocket: waiting on existing connect promise");
      return this._connectPromise;
    }

    debug("_ensureSocket: creating new connection");
    this._connectPromise = new Promise((resolve, reject) => {
      this._cleanupSocket();

      const socket = net.createConnection(SOCKET_PATH);
      this._persistentSocket = socket;
      this._socketBuffer = "";

      const connectTimeout = setTimeout(() => {
        socket.destroy();
        this._connectPromise = null;
        reject(new Error("Timeout connecting to session daemon"));
      }, CONNECT_TIMEOUT_MS);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        this._socketReady = true;
        this._connectPromise = null;
        debug("_ensureSocket: connected");
        resolve();
      });

      socket.on("data", (chunk) => {
        this._socketBuffer += chunk.toString();
        const lines = this._socketBuffer.split("\n");
        this._socketBuffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            debug(`RECV response: _reqId=${response._reqId}, hasError=${!!response.error}, pending=${this._pendingRequests.size}`);
            if (response._reqId !== undefined && this._pendingRequests.has(response._reqId)) {
              const { resolve: res, reject: rej, timer } = this._pendingRequests.get(response._reqId);
              this._pendingRequests.delete(response._reqId);
              clearTimeout(timer);
              debug(`Matched response to reqId=${response._reqId} (exact match)`);
              if (response.error) {
                rej(new Error(response.error));
              } else {
                res(response.result);
              }
            } else {
              const oldest = this._pendingRequests.entries().next();
              if (!oldest.done) {
                const [reqId, { resolve: res, reject: rej, timer }] = oldest.value;
                this._pendingRequests.delete(reqId);
                clearTimeout(timer);
                debug(`Matched response to reqId=${reqId} (FIFO fallback, response._reqId=${response._reqId})`);
                if (response.error) {
                  rej(new Error(response.error));
                } else {
                  res(response.result);
                }
              } else {
                debug(`WARN: No pending request to match response to! _reqId=${response._reqId}`);
              }
            }
          } catch (parseErr) {
            debug(`WARN: Failed to parse daemon response: ${parseErr.message}, line=${line.slice(0,100)}`);
          }
        }
      });

      socket.on("error", (err) => {
        clearTimeout(connectTimeout);
        this._socketReady = false;
        this._connectPromise = null;
        debug(`Socket ERROR: ${err.message}, pending=${this._pendingRequests.size}`);
        for (const [, { reject: rej, timer }] of this._pendingRequests) {
          clearTimeout(timer);
          rej(new Error(`Daemon connection lost: ${err.message}`));
        }
        this._pendingRequests.clear();
        reject(new Error(`Daemon connection failed: ${err.message}`));
      });

      socket.on("close", () => {
        debug(`Socket CLOSED, pending=${this._pendingRequests.size}`);
        this._socketReady = false;
        this._persistentSocket = null;
        this._connectPromise = null;
        for (const [, { reject: rej, timer }] of this._pendingRequests) {
          clearTimeout(timer);
          rej(new Error("Daemon connection closed"));
        }
        this._pendingRequests.clear();
      });
    });

    return this._connectPromise;
  }

  _cleanupSocket() {
    if (this._persistentSocket) {
      this._persistentSocket.removeAllListeners();
      this._persistentSocket.destroy();
      this._persistentSocket = null;
    }
    this._socketReady = false;
    for (const [, { reject: rej, timer }] of this._pendingRequests) {
      clearTimeout(timer);
      rej(new Error("Socket cleanup"));
    }
    this._pendingRequests.clear();
  }

  // ── Socket Communication ─────────────────────────────────────────────────

  async send(request) {
    debug(`send: method=${request.method}, ensuring daemon...`);
    await this.ensureDaemon();

    try {
      await this._ensureSocket();
    } catch (connectErr) {
      debug(`send: initial connect failed (${connectErr.message}), retrying...`);
      this._daemonVerifiedAt = 0;
      this._cleanupSocket();
      await this.ensureDaemon();
      await this._ensureSocket();
    }

    const reqId = ++this._requestIdCounter;
    const taggedRequest = { ...request, _reqId: reqId };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(reqId);
        debug(`send: TIMEOUT for reqId=${reqId} method=${request.method} after ${CONNECT_TIMEOUT_MS}ms, pending=${this._pendingRequests.size}`);
        reject(new Error(`Timeout waiting for daemon response (method=${request.method}, reqId=${reqId})`));
      }, CONNECT_TIMEOUT_MS);

      this._pendingRequests.set(reqId, { resolve, reject, timer });

      try {
        const payload = JSON.stringify(taggedRequest) + "\n";
        debug(`send: writing reqId=${reqId} method=${request.method} (${payload.length} bytes)`);
        this._persistentSocket.write(payload);
      } catch (err) {
        this._pendingRequests.delete(reqId);
        clearTimeout(timer);
        this._socketReady = false;
        debug(`send: WRITE FAILED for reqId=${reqId}: ${err.message}`);
        reject(new Error(`Failed to write to daemon: ${err.message}`));
      }
    });
  }

  // ── Session Lifecycle ────────────────────────────────────────────────────

  async register({ cwd, labels = {} } = {}) {
    if (this.sessionId) return { id: this.sessionId };

    const session = await this.send({
      method: "register",
      params: {
        pid: process.ppid || process.pid,
        cwd: cwd || process.cwd(),
        labels,
      },
    });

    this.sessionId = session.id;

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this._sendHeartbeat().catch(() => {});
      }, HEARTBEAT_INTERVAL_MS);
      if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
    }

    const cleanup = () => {
      this.deregister().catch(() => {});
    };
    process.once("exit", cleanup);
    process.once("SIGTERM", cleanup);
    process.once("SIGINT", cleanup);

    return session;
  }

  async _sendHeartbeat() {
    if (!this.sessionId) return;
    return this.send({
      method: "heartbeat",
      params: {
        id: this.sessionId,
        update: {
          status: this._status,
          currentTask: this._currentTask,
          toolsInUse: this._toolsInUse,
        },
      },
    });
  }

  async deregister() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (!this.sessionId) return;
    const id = this.sessionId;
    this.sessionId = null;
    try {
      await this.send({
        method: "deregister",
        params: { id },
      });
    } catch {}
    this._cleanupSocket();
  }

  // ── Activity Updates ─────────────────────────────────────────────────────

  async updateTask(task) {
    this._currentTask = task;
    if (!this.sessionId) return;
    return this.send({
      method: "heartbeat",
      params: {
        id: this.sessionId,
        update: {
          currentTask: task,
          status: task ? "busy" : "idle",
          activity: { type: "task", description: task },
        },
      },
    });
  }

  async updateTools(tools) {
    this._toolsInUse = tools;
    if (!this.sessionId) return;
    return this.send({
      method: "heartbeat",
      params: {
        id: this.sessionId,
        update: { toolsInUse: tools },
      },
    });
  }

  async postActivity(activity) {
    if (!this.sessionId) return;
    return this.send({
      method: "heartbeat",
      params: {
        id: this.sessionId,
        update: { activity },
      },
    });
  }

  // ── Query ────────────────────────────────────────────────────────────────

  async listSessions() {
    return this.send({
      method: "list",
      params: { excludeId: this.sessionId },
    });
  }

  async getSession(id) {
    return this.send({
      method: "get",
      params: { id },
    });
  }

  async ping() {
    return this.send({ method: "ping" });
  }

  // ── Messaging ────────────────────────────────────────────────────────────

  async sendMessage(toId, message) {
    if (!this.sessionId) throw new Error("Not registered");
    return this.send({
      method: "send_message",
      params: {
        fromId: this.sessionId,
        toId,
        message,
      },
    });
  }

  async getMessages() {
    if (!this.sessionId) return [];
    return this.send({
      method: "get_messages",
      params: { sessionId: this.sessionId },
    });
  }
}

module.exports = { SessionClient, SOCKET_PATH, STATE_DIR };
