#!/usr/bin/env node
/**
 * MCP Server: claude-code-mcp.js
 * Delegates to the `claude` CLI which handles OAuth authentication.
 * NEVER uses API keys — all auth flows through `claude auth login`.
 * Features: auth state tracking, usage logging, model display.
 */

const { spawn, spawnSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { createClaudeState, AuthState, startTimer } = require("./provider-state");
const { createLogger } = require("./dashboard-log");

const log = createLogger("claude");

const SUBAGENT_PROMPT_PATH = path.join(__dirname, "..", "agent-prompts", "claude-subagent.md");
let subagentPrompt = "";
try {
  subagentPrompt = fs.readFileSync(SUBAGENT_PROMPT_PATH, "utf-8").trim();
} catch (e) {
  // agent prompt not installed — continue without it
}

const rl = readline.createInterface({ input: process.stdin });
const state = createClaudeState();

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function initializeClient() {
  try {
    const result = spawnSync("which", ["claude"], { encoding: "utf8" });
    if (result.status === 0) {
      state.markOk(`cli:${result.stdout.trim()}`);
      log.logInit("OK", result.stdout.trim());
      return true;
    }
  } catch (e) {
    // fall through
  }
  state.authState = AuthState.MISSING;
  state.authDetail = "claude CLI not found. Install: npm install -g @anthropic-ai/cli && claude auth login";
  log.logInit("MISSING", state.authDetail);
  return false;
}

const TOOLS = [
  {
    name: "claude_code",
    description:
      "Delegate a coding task to Claude via authenticated CLI. Uses OAuth/session from claude CLI. " +
      "Supports token counting, vision, and streaming.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The task or question to send to Claude",
        },
        model: {
          type: "string",
          description:
            "Claude model to use (claude-opus-4-6, claude-sonnet-4-20250514). Defaults to claude-sonnet-4-20250514.",
          default: "claude-sonnet-4-20250514",
        },
        max_tokens: {
          type: "number",
          description: "Maximum tokens in response (default 4096)",
          default: 4096,
        },
      },
      required: ["prompt"],
    },
  },
];

function runClaude(prompt, model = "claude-sonnet-4-20250514", maxTokens = 4096) {
  return new Promise((resolve, reject) => {
    const elapsed = startTimer();

    try {
      const args = [
        "--print", "--no-color",
        "--model", model,
        "--max-tokens", String(maxTokens),
        "--output-format", "text",
        "--permission-mode", "plan",
      ];
      if (subagentPrompt) {
        args.push("--append-system-prompt", subagentPrompt);
      }

      const proc = spawn("claude", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let error = "";

      proc.stdout.on("data", (data) => { output += data.toString(); });
      proc.stderr.on("data", (data) => { error += data.toString(); });

      proc.on("close", (code) => {
        const latencyMs = elapsed();

        if (code === 0) {
          state.recordCall({ model, latencyMs });
          state.markOk();
          log.logCall(model, prompt, latencyMs);
          const tag = state.formatModelTag(model, { latencyMs });
          resolve({ text: output.trim(), tag });
        } else {
          const err = new Error(error || output || `Exit code ${code}`);
          state.recordCall({ model, latencyMs, error: err });
          log.logCall(model, prompt, latencyMs, err);

          const classified = state.classifyError(err);
          if (classified) {
            reject(new Error(
              `Claude error (${state.authState}): ${err.message}. ${state.authDetail}`
            ));
          } else {
            reject(new Error(`Claude CLI error: ${err.message}`));
          }
        }
      });

      proc.on("error", (err) => {
        const latencyMs = elapsed();
        state.recordCall({ model, latencyMs, error: err });
        reject(new Error(
          `Failed to run Claude CLI: ${err.message}. Ensure 'claude' is installed and authenticated: claude auth login`
        ));
      });

      proc.stdin.write(prompt);
      proc.stdin.end();
    } catch (err) {
      const latencyMs = elapsed();
      state.recordCall({ model, latencyMs, error: err });
      reject(new Error(
        `Failed to run Claude CLI: ${err.message}. Ensure 'claude' is installed and authenticated: claude auth login`
      ));
    }
  });
}

rl.on("line", async (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = msg;
  if (method) log.logMcpMethod(method);

  if (method === "initialize") {
    const initialized = initializeClient();
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: "claude-code-mcp",
          version: "4.0.0",
          auth: state.authState,
          authDetail: state.authDetail,
        },
      },
    });
  } else if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    const { name, arguments: args } = params;
    if (name === "claude_code") {
      try {
        const result = await runClaude(args.prompt, args.model, args.max_tokens);
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              { type: "text", text: result.text },
              { type: "text", text: `\n${result.tag}` },
            ],
          },
        });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          },
        });
      }
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool" } });
    }
  } else if (method === "resources/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        resources: [
          {
            uri: "provider://claude/status",
            name: "Claude Provider Status",
            description: "Auth state, usage metrics, and recent call log for Claude",
            mimeType: "application/json",
          },
        ],
      },
    });
  } else if (method === "resources/read") {
    const uri = params?.uri;
    if (uri === "provider://claude/status") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri: "provider://claude/status",
              mimeType: "application/json",
              text: JSON.stringify(state.getStatusSnapshot(), null, 2),
            },
          ],
        },
      });
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown resource" } });
    }
  } else if (method === "notifications/initialized") {
    // no-op
  } else {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
});
