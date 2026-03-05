/**
 * session-client.js — Client library for Crush instances to talk to the session daemon
 *
 * Provides:
 * - Auto-start daemon if not running
 * - Register/deregister sessions
 * - Heartbeat with activity updates
 * - Query sibling sessions
 * - Send/receive messages between sessions
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
const CONNECT_TIMEOUT_MS = 5_000;

class SessionClient {
  constructor() {
    this.sessionId = null;
    this.heartbeatTimer = null;
    this._currentTask = "";
    this._toolsInUse = [];
    this._status = "active";
  }

  // ── Daemon Management ────────────────────────────────────────────────────

  isDaemonRunning() {
    try {
      if (!fs.existsSync(PID_FILE)) return false;
      const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  async ensureDaemon() {
    if (this.isDaemonRunning()) return true;

    return new Promise((resolve) => {
      const child = spawn("node", [DAEMON_SCRIPT], {
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      });
      child.unref();

      // Wait for socket to appear
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (fs.existsSync(SOCKET_PATH)) {
          clearInterval(check);
          resolve(true);
        } else if (attempts > 20) {
          clearInterval(check);
          resolve(false);
        }
      }, 250);
    });
  }

  // ── Socket Communication ─────────────────────────────────────────────────

  async send(request) {
    await this.ensureDaemon();

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(SOCKET_PATH);
      let buffer = "";
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new Error("Timeout connecting to session daemon"));
        }
      }, CONNECT_TIMEOUT_MS);

      socket.on("connect", () => {
        socket.write(JSON.stringify(request) + "\n");
      });

      socket.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const response = JSON.parse(line);
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              socket.destroy();
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve(response.result);
              }
            }
          } catch {}
        }
      });

      socket.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(`Daemon connection failed: ${err.message}`));
        }
      });
    });
  }

  // ── Session Lifecycle ────────────────────────────────────────────────────

  async register({ cwd, labels = {} } = {}) {
    const session = await this.send({
      method: "register",
      params: {
        pid: process.ppid || process.pid,
        cwd: cwd || process.cwd(),
        labels,
      },
    });

    this.sessionId = session.id;

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      this._sendHeartbeat().catch(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // Deregister on exit
    const cleanup = () => {
      this.deregister().catch(() => {});
    };
    process.on("exit", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);

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
    try {
      await this.send({
        method: "deregister",
        params: { id: this.sessionId },
      });
    } catch {}
    this.sessionId = null;
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
