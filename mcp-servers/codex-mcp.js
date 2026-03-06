#!/usr/bin/env node
/**
 * MCP Server: codex-mcp.js
 * Delegates to the `codex` CLI which handles OAuth authentication.
 * NEVER uses API keys — all auth flows through `codex auth login`.
 * Features: auth state tracking, usage logging, model display.
 */

const { spawn, spawnSync } = require("child_process");
const readline = require("readline");
const { createCodexState, AuthState, startTimer } = require("./provider-state");

const rl = readline.createInterface({ input: process.stdin });
const state = createCodexState();

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function initializeClient() {
  try {
    const result = spawnSync("which", ["codex"], { encoding: "utf8" });
    if (result.status === 0) {
      state.markOk(`cli:${result.stdout.trim()}`);
      return true;
    }
  } catch (e) {
    // fall through
  }
  state.authState = AuthState.MISSING;
  state.authDetail = "codex CLI not found. Install: npm install -g @openai/codex && codex auth login";
  return false;
}

const TOOLS = [
  {
    name: "codex",
    description:
      "Delegate a task to OpenAI Codex via authenticated CLI. Uses OAuth/session from Codex CLI. " +
      "Best for: CI/CD pipeline control, agentic workflows, complex engineering tasks.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The task or question to send to Codex",
        },
      },
      required: ["prompt"],
    },
  },
];

function runCodex(prompt) {
  return new Promise((resolve, reject) => {
    const elapsed = startTimer();
    const model = "codex-cli";

    try {
      const codex = spawn("codex", ["run"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let error = "";

      codex.stdout.on("data", (data) => { output += data.toString(); });
      codex.stderr.on("data", (data) => { error += data.toString(); });

      codex.on("close", (code) => {
        const latencyMs = elapsed();

        if (code === 0) {
          state.recordCall({ model, latencyMs });
          state.markOk();
          const tag = state.formatModelTag(model, { latencyMs });
          resolve({ text: output.trim(), tag });
        } else {
          const err = new Error(error || output || `Exit code ${code}`);
          state.recordCall({ model, latencyMs, error: err });

          const classified = state.classifyError(err);
          if (classified) {
            reject(new Error(
              `Codex error (${state.authState}): ${err.message}. ${state.authDetail}`
            ));
          } else {
            reject(new Error(`Codex CLI error: ${err.message}`));
          }
        }
      });

      codex.on("error", (err) => {
        const latencyMs = elapsed();
        state.recordCall({ model, latencyMs, error: err });
        reject(new Error(
          `Failed to run Codex CLI: ${err.message}. Ensure 'codex' is installed and authenticated: codex auth login`
        ));
      });

      codex.stdin.write(prompt);
      codex.stdin.end();
    } catch (err) {
      const latencyMs = elapsed();
      state.recordCall({ model, latencyMs, error: err });
      reject(new Error(
        `Failed to run Codex CLI: ${err.message}. Ensure 'codex' is installed and authenticated: codex auth login`
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

  if (method === "initialize") {
    const initialized = initializeClient();
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: "codex-mcp",
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
    if (name === "codex") {
      try {
        const result = await runCodex(args.prompt);
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
            uri: "provider://codex/status",
            name: "Codex Provider Status",
            description: "Auth state, usage metrics, and recent call log for Codex",
            mimeType: "application/json",
          },
        ],
      },
    });
  } else if (method === "resources/read") {
    const uri = params?.uri;
    if (uri === "provider://codex/status") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri: "provider://codex/status",
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
