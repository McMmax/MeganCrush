/**
 * dashboard-log.js — Real-time activity logging for Megan tmux dashboard
 *
 * Writes timestamped, human-readable log entries to:
 *   ~/.config/crush/logs/<provider>.log
 *
 * These logs are tailed by the megan-tmux.sh dashboard to show
 * real-time MCP server activity per agent.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

const LOG_DIR = path.join(os.homedir(), ".config", "crush", "logs");

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (e) {
    // non-fatal
  }
}

function createLogger(providerName) {
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${providerName}.log`);

  function log(level, message, meta = {}) {
    const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
    const metaStr = Object.keys(meta).length > 0
      ? " " + Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(" ")
      : "";
    const line = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${providerName}] ${message}${metaStr}\n`;

    try {
      fs.appendFileSync(logPath, line);
    } catch (e) {
      // non-fatal — dashboard just won't show this entry
    }

    // also emit to stderr for direct console visibility
    process.stderr.write(line);
  }

  return {
    info:  (msg, meta) => log("info",  msg, meta),
    warn:  (msg, meta) => log("warn",  msg, meta),
    error: (msg, meta) => log("error", msg, meta),
    call:  (msg, meta) => log("call",  msg, meta),
    auth:  (msg, meta) => log("auth",  msg, meta),

    logCall(model, prompt, latencyMs, error = null) {
      const truncPrompt = prompt.length > 120 ? prompt.slice(0, 120) + "…" : prompt;
      if (error) {
        log("error", `CALL FAILED`, { model, latency: `${(latencyMs / 1000).toFixed(1)}s`, error: error.message || String(error) });
      } else {
        log("call", `${truncPrompt}`, { model, latency: `${(latencyMs / 1000).toFixed(1)}s` });
      }
    },

    logInit(status, detail = "") {
      log("auth", `INIT ${status}${detail ? ": " + detail : ""}`);
    },

    logMcpMethod(method) {
      log("info", `MCP ← ${method}`);
    },

    getLogPath() {
      return logPath;
    },
  };
}

module.exports = { createLogger, LOG_DIR };
