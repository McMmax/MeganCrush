#!/usr/bin/env node
/**
 * provider-state.js — Shared auth state machine, usage tracking, and model display
 *
 * Inspired by vscode-antigravity-cockpit's oauth_service.ts pattern:
 *   - Auth states: ok | missing | expired | invalid | refresh_failed | unconfigured
 *   - Token refresh tracking with 5-minute buffer
 *   - Per-call usage logging (model, tokens in/out, cache, latency)
 *   - Session-level budget enforcement
 *   - Right-side panel data emission via MCP resources
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Auth States ────────────────────────────────────────────────────────────

const AuthState = Object.freeze({
  OK: "ok",
  MISSING: "missing",
  EXPIRED: "expired",
  INVALID: "invalid",
  REFRESH_FAILED: "refresh_failed",
  UNCONFIGURED: "unconfigured",
});

// ─── Provider Registry ─────────────────────────────────────────────────────

class ProviderState {
  constructor(name, { credentialPaths = [], envVars = [], authCommand = "" } = {}) {
    this.name = name;
    this.credentialPaths = credentialPaths;
    this.envVars = envVars;
    this.authCommand = authCommand;

    this.authState = AuthState.UNCONFIGURED;
    this.authDetail = "";
    this.lastAuthCheck = null;
    this.tokenExpiresAt = null;

    this.currentModel = null;
    this.callLog = [];
    this.sessionUsage = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheTokens: 0,
      totalCalls: 0,
      totalErrors: 0,
      totalLatencyMs: 0,
    };
  }

  // ── Auth Lifecycle ──────────────────────────────────────────────────────

  checkCredentials() {
    for (const envVar of this.envVars) {
      if (process.env[envVar]) {
        this.authState = AuthState.OK;
        this.authDetail = `env:${envVar}`;
        this.lastAuthCheck = new Date().toISOString();
        return { state: AuthState.OK, source: `env:${envVar}` };
      }
    }

    for (const credPath of this.credentialPaths) {
      const resolved = credPath.replace("~", os.homedir());
      if (fs.existsSync(resolved)) {
        try {
          const content = fs.readFileSync(resolved, "utf-8").trim();
          if (content.length > 0) {
            this.authState = AuthState.OK;
            this.authDetail = `file:${resolved}`;
            this.lastAuthCheck = new Date().toISOString();
            return { state: AuthState.OK, source: `file:${resolved}` };
          }
        } catch (e) {
          // unreadable
        }
      }
    }

    this.authState = AuthState.MISSING;
    this.authDetail = `No credentials found. Run: ${this.authCommand}`;
    this.lastAuthCheck = new Date().toISOString();
    return { state: AuthState.MISSING, source: null };
  }

  setTokenExpiry(expiresAt) {
    this.tokenExpiresAt = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  }

  needsRefresh(bufferMs = 5 * 60 * 1000) {
    if (!this.tokenExpiresAt) return false;
    return (this.tokenExpiresAt.getTime() - Date.now()) < bufferMs;
  }

  isExpired() {
    if (!this.tokenExpiresAt) return false;
    return this.tokenExpiresAt.getTime() <= Date.now();
  }

  markOk(detail) {
    this.authState = AuthState.OK;
    this.authDetail = detail || this.authDetail;
    this.lastAuthCheck = new Date().toISOString();
  }

  markExpired(detail) {
    this.authState = AuthState.EXPIRED;
    this.authDetail = detail || "Token expired";
    this.lastAuthCheck = new Date().toISOString();
  }

  markInvalid(detail) {
    this.authState = AuthState.INVALID;
    this.authDetail = detail || "Credentials invalid (revoked or corrupted)";
    this.lastAuthCheck = new Date().toISOString();
  }

  markRefreshFailed(detail) {
    this.authState = AuthState.REFRESH_FAILED;
    this.authDetail = detail || "Token refresh failed";
    this.lastAuthCheck = new Date().toISOString();
  }

  classifyError(err) {
    const msg = (err.message || err.toString()).toLowerCase();
    if (msg.includes("invalid_grant") || msg.includes("revoked")) {
      this.markInvalid(err.message);
      return AuthState.INVALID;
    }
    if (msg.includes("401") || msg.includes("authentication") || msg.includes("unauthorized")) {
      this.markExpired(err.message);
      return AuthState.EXPIRED;
    }
    if (msg.includes("403") || msg.includes("forbidden") || msg.includes("permission")) {
      this.markInvalid(`Forbidden: ${err.message}`);
      return AuthState.INVALID;
    }
    if (msg.includes("refresh") && msg.includes("fail")) {
      this.markRefreshFailed(err.message);
      return AuthState.REFRESH_FAILED;
    }
    return null;
  }

  // ── Usage Tracking ──────────────────────────────────────────────────────

  recordCall({ model, inputTokens = 0, outputTokens = 0, cacheTokens = 0, latencyMs = 0, error = null }) {
    this.currentModel = model;
    const entry = {
      timestamp: new Date().toISOString(),
      model,
      inputTokens,
      outputTokens,
      cacheTokens,
      latencyMs,
      error: error ? error.message || String(error) : null,
    };
    this.callLog.push(entry);

    if (!error) {
      this.sessionUsage.totalInputTokens += inputTokens;
      this.sessionUsage.totalOutputTokens += outputTokens;
      this.sessionUsage.totalCacheTokens += cacheTokens;
      this.sessionUsage.totalCalls += 1;
      this.sessionUsage.totalLatencyMs += latencyMs;
    } else {
      this.sessionUsage.totalErrors += 1;
    }

    this.persistUsage();
    return entry;
  }

  // ── Model Display ───────────────────────────────────────────────────────

  formatModelTag(model, metadata = {}) {
    const parts = [`Model: ${model}`];

    if (metadata.inputTokens !== undefined && metadata.outputTokens !== undefined) {
      parts.push(`Tokens: ${metadata.inputTokens}→${metadata.outputTokens}`);
    }
    if (metadata.cacheTokens > 0) {
      parts.push(`Cache: ${metadata.cacheTokens}`);
    }
    if (metadata.latencyMs > 0) {
      parts.push(`${(metadata.latencyMs / 1000).toFixed(1)}s`);
    }

    return `[${parts.join(" | ")}]`;
  }

  // ── Status Snapshot (for panel / resources) ─────────────────────────────

  getStatusSnapshot() {
    return {
      provider: this.name,
      auth: {
        state: this.authState,
        detail: this.authDetail,
        lastCheck: this.lastAuthCheck,
        tokenExpiresAt: this.tokenExpiresAt ? this.tokenExpiresAt.toISOString() : null,
        needsRefresh: this.needsRefresh(),
      },
      currentModel: this.currentModel,
      session: { ...this.sessionUsage },
      recentCalls: this.callLog.slice(-10),
    };
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  persistUsage() {
    try {
      const stateDir = path.join(os.homedir(), ".config", "crush", "provider-state");
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }
      const filePath = path.join(stateDir, `${this.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(this.getStatusSnapshot(), null, 2));
    } catch (e) {
      // non-fatal
    }
  }

  loadPersistedUsage() {
    try {
      const filePath = path.join(os.homedir(), ".config", "crush", "provider-state", `${this.name}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        if (data.session) {
          this.sessionUsage = { ...this.sessionUsage, ...data.session };
        }
        if (data.recentCalls) {
          this.callLog = data.recentCalls;
        }
        return data;
      }
    } catch (e) {
      // non-fatal
    }
    return null;
  }
}

// ─── Pre-configured Provider Factories ──────────────────────────────────────

function createClaudeState() {
  return new ProviderState("claude", {
    credentialPaths: [],
    envVars: [],
    authCommand: "claude auth login",
  });
}

function createGeminiState() {
  return new ProviderState("gemini", {
    credentialPaths: [],
    envVars: [],
    authCommand: "gcloud auth application-default login",
  });
}

function createCodexState() {
  return new ProviderState("codex", {
    credentialPaths: [],
    envVars: [],
    authCommand: "codex auth login",
  });
}

// ─── Aggregate Dashboard ────────────────────────────────────────────────────

function getAllProviderSnapshots() {
  const stateDir = path.join(os.homedir(), ".config", "crush", "provider-state");
  const snapshots = {};
  if (!fs.existsSync(stateDir)) return snapshots;

  for (const file of fs.readdirSync(stateDir)) {
    if (file.endsWith(".json")) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(stateDir, file), "utf-8"));
        snapshots[data.provider || file.replace(".json", "")] = data;
      } catch (e) {
        // skip
      }
    }
  }
  return snapshots;
}

// ─── Timer Utility for Latency ──────────────────────────────────────────────

function startTimer() {
  const start = process.hrtime.bigint();
  return () => Number(process.hrtime.bigint() - start) / 1_000_000;
}

module.exports = {
  AuthState,
  ProviderState,
  createClaudeState,
  createGeminiState,
  createCodexState,
  getAllProviderSnapshots,
  startTimer,
};
