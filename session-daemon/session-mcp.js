#!/usr/bin/env node
/**
 * session-mcp.js — MCP server for multi-instance Crush session awareness
 *
 * Provides tools for Crush/Megan to:
 * - See all running sibling sessions and what they're doing
 * - Send messages to other sessions
 * - Receive messages from other sessions
 * - Register/deregister the current session
 *
 * Auto-starts the session daemon if not running.
 * Follows the same MCP stdio JSON-RPC pattern as claude-code-mcp.js.
 */

const readline = require("readline");
const { SessionClient } = require("./session-client");

const rl = readline.createInterface({ input: process.stdin });
const client = new SessionClient();

let registered = false;

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const TOOLS = [
  {
    name: "sessions_list",
    description:
      "List all active Megan/Crush sessions. Shows each session's project, working directory, " +
      "current task, status (active/idle/busy), tools in use, and recent activity history. " +
      "Use this to see what other Crush instances are working on.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "sessions_get",
    description:
      "Get detailed information about a specific session by ID, including its full activity history.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The session ID to look up",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "sessions_send_message",
    description:
      "Send a message to another Crush session. The message will be queued and " +
      "delivered when that session checks for messages. Use this for coordination " +
      "between parallel instances (e.g., 'I finished the auth module, you can start on routes').",
    inputSchema: {
      type: "object",
      properties: {
        to_session_id: {
          type: "string",
          description: "Target session ID to send the message to",
        },
        message: {
          type: "string",
          description: "The message content to send",
        },
      },
      required: ["to_session_id", "message"],
    },
  },
  {
    name: "sessions_get_messages",
    description:
      "Check for messages sent to this session from other Crush instances. " +
      "Returns and clears the message queue.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "sessions_update_task",
    description:
      "Update this session's current task description so other sessions can see " +
      "what you're working on. Call this when starting a new task.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "Description of the current task (e.g., 'Refactoring auth module')",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "sessions_daemon_status",
    description:
      "Get the session daemon's status including uptime, total sessions, and socket path.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

function formatSessionList(sessions) {
  if (!sessions || sessions.length === 0) {
    return "No other Crush sessions are currently running.";
  }

  const lines = [`**${sessions.length} active session(s):**\n`];

  for (const s of sessions) {
    const age = timeSince(s.startedAt);
    const lastBeat = timeSince(s.lastHeartbeat);
    lines.push(`### Session \`${s.id.slice(0, 8)}\``);
    lines.push(`- **Project:** ${s.project} (\`${s.cwd}\`)`);
    lines.push(`- **PID:** ${s.pid}`);
    lines.push(`- **Status:** ${s.status}`);
    lines.push(`- **Running for:** ${age}`);
    lines.push(`- **Last heartbeat:** ${lastBeat} ago`);

    if (s.currentTask) {
      lines.push(`- **Current task:** ${s.currentTask}`);
    }
    if (s.toolsInUse && s.toolsInUse.length > 0) {
      lines.push(`- **Tools in use:** ${s.toolsInUse.join(", ")}`);
    }
    if (s.history && s.history.length > 0) {
      const recent = s.history.slice(-5);
      lines.push(`- **Recent activity:**`);
      for (const h of recent) {
        const ts = new Date(h.timestamp).toLocaleTimeString();
        lines.push(`  - [${ts}] ${h.description || h.type || JSON.stringify(h)}`);
      }
    }
    if (s.labels && Object.keys(s.labels).length > 0) {
      lines.push(`- **Labels:** ${JSON.stringify(s.labels)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatSessionDetail(session) {
  if (!session) return "Session not found.";
  const s = session;
  const lines = [
    `## Session \`${s.id}\``,
    `- **Project:** ${s.project} (\`${s.cwd}\`)`,
    `- **PID:** ${s.pid}`,
    `- **Status:** ${s.status}`,
    `- **Started:** ${s.startedAt}`,
    `- **Last heartbeat:** ${s.lastHeartbeat}`,
  ];
  if (s.currentTask) lines.push(`- **Current task:** ${s.currentTask}`);
  if (s.toolsInUse?.length > 0) lines.push(`- **Tools in use:** ${s.toolsInUse.join(", ")}`);
  if (s.labels && Object.keys(s.labels).length > 0) lines.push(`- **Labels:** ${JSON.stringify(s.labels)}`);

  if (s.history && s.history.length > 0) {
    lines.push(`\n### Activity History (last ${Math.min(s.history.length, 50)} entries)`);
    for (const h of s.history) {
      const ts = new Date(h.timestamp).toLocaleTimeString();
      lines.push(`- [${ts}] ${h.description || h.type || JSON.stringify(h)}`);
    }
  }

  return lines.join("\n");
}

function timeSince(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

async function ensureRegistered() {
  if (registered) return;
  try {
    await client.register({ cwd: process.cwd() });
    registered = true;
  } catch (e) {
    process.stderr.write(`[session-mcp] Registration failed: ${e.message}\n`);
  }
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
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {} },
        serverInfo: {
          name: "megan-sessions",
          version: "1.0.0",
        },
      },
    });
  } else if (method === "notifications/initialized") {
    ensureRegistered().catch(() => {});
  } else if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    const { name, arguments: args } = params;
    try {
      await ensureRegistered();

      switch (name) {
        case "sessions_list": {
          const sessions = await client.listSessions();
          send({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: formatSessionList(sessions) }],
            },
          });
          break;
        }

        case "sessions_get": {
          const session = await client.getSession(args.session_id);
          send({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: formatSessionDetail(session) }],
            },
          });
          break;
        }

        case "sessions_send_message": {
          const result = await client.sendMessage(args.to_session_id, args.message);
          const text = result.sent
            ? `Message sent to session ${args.to_session_id.slice(0, 8)}.`
            : `Failed: ${result.error || "unknown error"}`;
          send({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text }],
            },
          });
          break;
        }

        case "sessions_get_messages": {
          const messages = await client.getMessages();
          let text;
          if (messages.length === 0) {
            text = "No new messages.";
          } else {
            const lines = [`**${messages.length} message(s):**\n`];
            for (const m of messages) {
              const ts = new Date(m.timestamp).toLocaleTimeString();
              lines.push(`- [${ts}] From **${m.fromProject}** (\`${m.from.slice(0, 8)}\`): ${m.message}`);
            }
            text = lines.join("\n");
          }
          send({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text }],
            },
          });
          break;
        }

        case "sessions_update_task": {
          await client.updateTask(args.task);
          send({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: `Task updated: ${args.task}` }],
            },
          });
          break;
        }

        case "sessions_daemon_status": {
          const status = await client.ping();
          send({
            jsonrpc: "2.0",
            id,
            result: {
              content: [{
                type: "text",
                text: `Daemon running — ${status.sessions} session(s), uptime ${Math.floor(status.uptime)}s`,
              }],
            },
          });
          break;
        }

        default:
          send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Unknown tool" } });
      }
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
  } else if (method === "resources/list") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        resources: [
          {
            uri: "sessions://status",
            name: "Megan Session Status",
            description: "Current multi-instance session status",
            mimeType: "application/json",
          },
        ],
      },
    });
  } else if (method === "resources/read") {
    if (params?.uri === "sessions://status") {
      try {
        const sessions = await client.listSessions();
        send({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [{
              uri: "sessions://status",
              mimeType: "application/json",
              text: JSON.stringify({ thisSession: client.sessionId, sessions }, null, 2),
            }],
          },
        });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            contents: [{
              uri: "sessions://status",
              mimeType: "application/json",
              text: JSON.stringify({ error: err.message }),
            }],
          },
        });
      }
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown resource" } });
    }
  } else {
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
});

process.on("exit", () => {
  client.deregister().catch(() => {});
});
process.on("SIGTERM", () => { client.deregister().catch(() => {}); process.exit(0); });
process.on("SIGINT", () => { client.deregister().catch(() => {}); process.exit(0); });
