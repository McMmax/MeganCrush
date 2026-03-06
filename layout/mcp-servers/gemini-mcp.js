#!/usr/bin/env node
/**
 * MCP Server: gemini-mcp.js
 * Delegates to the `gemini` CLI which handles OAuth authentication via gcloud.
 * NEVER uses API keys — all auth flows through `gcloud auth application-default login`.
 * Features: auth state tracking, usage logging, model display.
 */

const { spawn, spawnSync } = require("child_process");
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { createGeminiState, AuthState, startTimer } = require("./provider-state");
const { createLogger } = require("./dashboard-log");

const log = createLogger("gemini");

const SUBAGENT_PROMPT_PATH = path.join(__dirname, "..", "agent-prompts", "gemini-subagent.md");
let subagentPrompt = "";
try {
  subagentPrompt = fs.readFileSync(SUBAGENT_PROMPT_PATH, "utf-8").trim();
} catch (e) {
  // agent prompt not installed — continue without it
}

const rl = readline.createInterface({ input: process.stdin });
const state = createGeminiState();

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function initializeClient() {
  try {
    const result = spawnSync("which", ["gemini"], { encoding: "utf8" });
    if (result.status === 0) {
      state.markOk(`cli:${result.stdout.trim()}`);
      log.logInit("OK", result.stdout.trim());
      return true;
    }
  } catch (e) {
    // fall through
  }
  state.authState = AuthState.MISSING;
  state.authDetail = "gemini CLI not found. Install: npm install -g @google/gemini-cli && gcloud auth application-default login";
  log.logInit("MISSING", state.authDetail);
  return false;
}

const TOOLS = [
  {
    name: "gemini",
    description:
      "Delegate a task to Google Gemini via authenticated CLI. Uses OAuth/ADC from gcloud CLI. " +
      "Best for: long context (1M tokens), multimodal, prompt caching (90% savings).",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The task or question to send to Gemini",
        },
        model: {
          type: "string",
          description:
            "Gemini model to use (gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite). Defaults to gemini-2.5-pro.",
          default: "gemini-2.5-pro",
        },
        max_output_tokens: {
          type: "number",
          description: "Maximum output tokens (default 4096)",
          default: 4096,
        },
      },
      required: ["prompt"],
    },
  },
];

function runGemini(prompt, model = "gemini-2.5-pro", maxOutputTokens = 4096) {
  return new Promise((resolve, reject) => {
    const elapsed = startTimer();
    const fullPrompt = subagentPrompt
      ? `<system>\n${subagentPrompt}\n</system>\n\n${prompt}`
      : prompt;

    try {
      const args = [
        "--prompt", fullPrompt,
        "--model", model,
        "--output-format", "text",
      ];

      const proc = spawn("gemini", args, {
        stdio: ["ignore", "pipe", "pipe"],
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
              `Gemini error (${state.authState}): ${err.message}. ${state.authDetail}`
            ));
          } else {
            reject(new Error(`Gemini CLI error: ${err.message}`));
          }
        }
      });

      proc.on("error", (err) => {
        const latencyMs = elapsed();
        state.recordCall({ model, latencyMs, error: err });
        reject(new Error(
          `Failed to run Gemini CLI: ${err.message}. Ensure 'gemini' is installed and authenticated: gcloud auth application-default login`
        ));
      });
    } catch (err) {
      const latencyMs = elapsed();
      state.recordCall({ model, latencyMs, error: err });
      reject(new Error(
        `Failed to run Gemini CLI: ${err.message}. Ensure 'gemini' is installed and authenticated: gcloud auth application-default login`
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
          name: "gemini-mcp",
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
    if (name === "gemini") {
      try {
        const result = await runGemini(args.prompt, args.model, args.max_output_tokens);
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
            uri: "provider://gemini/status",
            name: "Gemini Provider Status",
            description: "Auth state, usage metrics, and recent call log for Gemini",
            mimeType: "application/json",
          },
        ],
      },
    });
  } else if (method === "resources/read") {
    const uri = params?.uri;
    if (uri === "provider://gemini/status") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri: "provider://gemini/status",
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
