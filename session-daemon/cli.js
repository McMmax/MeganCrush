#!/usr/bin/env node
/**
 * megan-sessions CLI — Terminal tool for viewing and managing Crush sessions
 *
 * Usage:
 *   megan-sessions                  # List all sessions
 *   megan-sessions list             # List all sessions
 *   megan-sessions status           # Daemon status
 *   megan-sessions watch            # Live-watch session changes
 *   megan-sessions send <id> <msg>  # Send message to a session
 *   megan-sessions kill <id>        # Deregister a session
 *   megan-sessions daemon start     # Start the daemon
 *   megan-sessions daemon stop      # Stop the daemon
 *   megan-sessions daemon restart   # Restart the daemon
 */

const net = require("net");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const STATE_DIR = path.join(os.homedir(), ".config", "crush", "sessions");
const SOCKET_PATH = path.join(STATE_DIR, "megan-daemon.sock");
const PID_FILE = path.join(STATE_DIR, "daemon.pid");
const DAEMON_SCRIPT = path.join(__dirname, "daemon.js");

// ─── Colors ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

const statusColors = {
  active: C.green,
  idle: C.gray,
  busy: C.yellow,
  dead: C.red,
};

// ─── Socket Communication ────────────────────────────────────────────────────

function sendRequest(request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    let buffer = "";

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
          socket.destroy();
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
          return;
        } catch {}
      }
    });

    socket.on("error", (err) => {
      reject(new Error(`Cannot connect to daemon: ${err.message}\nRun: megan-sessions daemon start`));
    });
  });
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function cmdList() {
  const sessions = await sendRequest({ method: "list", params: {} });

  if (!sessions || sessions.length === 0) {
    console.log(`${C.dim}No active Crush sessions.${C.reset}`);
    return;
  }

  console.log(`\n${C.bold}${C.cyan}━━━ MEGAN SESSIONS (${sessions.length}) ━━━${C.reset}\n`);

  for (const s of sessions) {
    const color = statusColors[s.status] || C.reset;
    const age = timeSince(s.startedAt);
    const beat = timeSince(s.lastHeartbeat);

    console.log(`${C.bold}${color}● ${s.status.toUpperCase().padEnd(6)}${C.reset} ${C.bold}${s.id.slice(0, 8)}${C.reset} ${C.dim}│${C.reset} ${C.magenta}${s.project}${C.reset}`);
    console.log(`  ${C.dim}PID${C.reset} ${s.pid}  ${C.dim}CWD${C.reset} ${s.cwd}`);
    console.log(`  ${C.dim}Up${C.reset} ${age}  ${C.dim}Last beat${C.reset} ${beat} ago`);

    if (s.currentTask) {
      console.log(`  ${C.yellow}⟩ ${s.currentTask}${C.reset}`);
    }
    if (s.toolsInUse && s.toolsInUse.length > 0) {
      console.log(`  ${C.blue}Tools: ${s.toolsInUse.join(", ")}${C.reset}`);
    }
    if (s.history && s.history.length > 0) {
      const recent = s.history.slice(-3);
      for (const h of recent) {
        const ts = new Date(h.timestamp).toLocaleTimeString();
        console.log(`  ${C.gray}  ${ts} ${h.description || h.type || "activity"}${C.reset}`);
      }
    }
    console.log();
  }
}

async function cmdStatus() {
  const status = await sendRequest({ method: "status" });
  console.log(`\n${C.bold}${C.cyan}━━━ MEGAN DAEMON STATUS ━━━${C.reset}\n`);
  console.log(`  ${C.dim}PID:${C.reset}      ${status.pid}`);
  console.log(`  ${C.dim}Socket:${C.reset}   ${status.socketPath}`);
  console.log(`  ${C.dim}Uptime:${C.reset}   ${formatUptime(status.uptime)}`);
  console.log(`  ${C.dim}Sessions:${C.reset} ${status.sessions}`);
  console.log();
}

async function cmdWatch() {
  console.log(`${C.bold}${C.cyan}━━━ WATCHING SESSIONS (Ctrl+C to stop) ━━━${C.reset}\n`);

  const socket = net.createConnection(SOCKET_PATH);
  socket.on("connect", () => {
    socket.write(JSON.stringify({ method: "subscribe" }) + "\n");
  });

  let buffer = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "event") {
          const ts = new Date().toLocaleTimeString();
          const color = msg.event.includes("deregister") || msg.event.includes("reap") ? C.red : C.green;
          console.log(`${C.gray}[${ts}]${C.reset} ${color}${msg.event}${C.reset}`);
          if (msg.data?.session) {
            const s = msg.data.session;
            console.log(`  ${C.magenta}${s.project}${C.reset} (pid=${s.pid}, id=${s.id.slice(0, 8)})`);
          }
          if (msg.data?.id) {
            console.log(`  Session: ${msg.data.id.slice(0, 8)}`);
          }
        }
      } catch {}
    }
  });

  socket.on("error", (err) => {
    console.error(`${C.red}Connection lost: ${err.message}${C.reset}`);
    process.exit(1);
  });

  // Also poll and display full list every 5 seconds
  const poll = setInterval(async () => {
    try {
      const sessions = await sendRequest({ method: "list", params: {} });
      process.stdout.write(`\r${C.dim}${sessions.length} session(s) active${C.reset}   `);
    } catch {}
  }, 5000);

  process.on("SIGINT", () => {
    clearInterval(poll);
    socket.destroy();
    console.log(`\n${C.dim}Stopped watching.${C.reset}`);
    process.exit(0);
  });
}

async function cmdSend(sessionId, message) {
  // Find matching session by prefix
  const sessions = await sendRequest({ method: "list", params: {} });
  const match = sessions.find((s) => s.id.startsWith(sessionId));
  if (!match) {
    console.error(`${C.red}No session matching "${sessionId}"${C.reset}`);
    process.exit(1);
  }

  // We need to register ourselves to send
  const self = await sendRequest({
    method: "register",
    params: { pid: process.pid, cwd: process.cwd(), labels: { cli: true } },
  });

  const result = await sendRequest({
    method: "send_message",
    params: { fromId: self.id, toId: match.id, message },
  });

  if (result.sent) {
    console.log(`${C.green}Message sent to ${match.project} (${match.id.slice(0, 8)})${C.reset}`);
  } else {
    console.error(`${C.red}Failed: ${result.error}${C.reset}`);
  }

  // Deregister CLI session
  await sendRequest({ method: "deregister", params: { id: self.id } });
}

async function cmdKill(sessionId) {
  const sessions = await sendRequest({ method: "list", params: {} });
  const match = sessions.find((s) => s.id.startsWith(sessionId));
  if (!match) {
    console.error(`${C.red}No session matching "${sessionId}"${C.reset}`);
    process.exit(1);
  }

  const result = await sendRequest({ method: "deregister", params: { id: match.id } });
  console.log(`${C.yellow}Deregistered session ${match.id.slice(0, 8)} (${match.project})${C.reset}`);
}

function cmdDaemon(action) {
  switch (action) {
    case "start": {
      // Check if already running
      try {
        if (fs.existsSync(PID_FILE)) {
          const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
          process.kill(pid, 0);
          console.log(`${C.yellow}Daemon already running (pid=${pid})${C.reset}`);
          return;
        }
      } catch {}

      const child = spawn("node", [DAEMON_SCRIPT], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log(`${C.green}Daemon started${C.reset}`);
      break;
    }

    case "stop": {
      try {
        const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
        process.kill(pid, "SIGTERM");
        console.log(`${C.yellow}Daemon stopped (pid=${pid})${C.reset}`);
      } catch {
        console.error(`${C.red}Daemon not running${C.reset}`);
      }
      break;
    }

    case "restart": {
      try {
        const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim());
        process.kill(pid, "SIGTERM");
      } catch {}

      setTimeout(() => {
        const child = spawn("node", [DAEMON_SCRIPT], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log(`${C.green}Daemon restarted${C.reset}`);
      }, 500);
      break;
    }

    default:
      console.error(`Unknown daemon command: ${action}`);
      console.error("Usage: megan-sessions daemon [start|stop|restart]");
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeSince(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function showHelp() {
  console.log(`
${C.bold}${C.cyan}megan-sessions${C.reset} — Multi-instance Crush session manager

${C.bold}Usage:${C.reset}
  megan-sessions                    List all active sessions
  megan-sessions list               List all active sessions
  megan-sessions status             Show daemon status
  megan-sessions watch              Live-watch session events
  megan-sessions send <id> <msg>    Send message to a session
  megan-sessions kill <id>          Deregister a session
  megan-sessions daemon start       Start the session daemon
  megan-sessions daemon stop        Stop the daemon
  megan-sessions daemon restart     Restart the daemon
  megan-sessions help               Show this help
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "list";

  try {
    switch (cmd) {
      case "list":
      case "ls":
        await cmdList();
        break;
      case "status":
        await cmdStatus();
        break;
      case "watch":
      case "w":
        await cmdWatch();
        break;
      case "send":
        if (args.length < 3) {
          console.error("Usage: megan-sessions send <session-id-prefix> <message>");
          process.exit(1);
        }
        await cmdSend(args[1], args.slice(2).join(" "));
        break;
      case "kill":
      case "rm":
        if (args.length < 2) {
          console.error("Usage: megan-sessions kill <session-id-prefix>");
          process.exit(1);
        }
        await cmdKill(args[1]);
        break;
      case "daemon":
        cmdDaemon(args[1] || "start");
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        console.error(`Unknown command: ${cmd}`);
        showHelp();
        process.exit(1);
    }
  } catch (err) {
    console.error(`${C.red}${err.message}${C.reset}`);
    process.exit(1);
  }
}

main();
