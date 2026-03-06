# Crush Multi-Agent Setup

You are an orchestrating AI coding agent running inside **Crush**. You have access to three
specialized AI sub-agents via MCP tools. Use your judgment to decide when to delegate.

## Available Sub-Agents

### `claude_code` — Claude Code CLI
**Best for:**
- Complex multi-file refactors requiring deep reasoning
- Architecture decisions needing careful step-by-step thinking
- Tasks where you want a fresh Claude perspective with full tool access
- Long autonomous tasks you want to run "in the background"

**Usage:** `claude_code(prompt="<detailed task description>", cwd="/optional/path")`

---

### `gemini` — Google Gemini CLI
**Best for:**
- Tasks requiring very long context (Gemini supports 1M+ tokens)
- Ingesting entire large codebases at once
- Multimodal tasks (images + code)
- Google Cloud / Firebase / GCP integrations
- Getting a second opinion from a different model family

**Usage:** `gemini(prompt="<task>", model="gemini-2.5-pro")`
Available models: `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-2.0-flash-thinking`

---

### `codex` — OpenAI Codex CLI
**Best for:**
- Tasks where o3/o4-mini reasoning models excel (math, algorithms, proofs)
- OpenAI ecosystem integrations (GPT, Assistants API, fine-tuning)
- Getting an OpenAI-family perspective on a problem
- Fast, cost-effective completions with `o4-mini`

**Usage:** `codex(prompt="<task>", model="o4-mini")`
Available models: `o3`, `o4-mini`, `gpt-4o`

---

## Delegation Guidelines

1. **Default:** Handle tasks yourself as the main agent.
2. **Delegate to claude_code** when: the task is complex enough to benefit from a
   fully autonomous Claude agent with its own tool loop.
3. **Delegate to gemini** when: context is massive (>100k tokens of files), or the
   user explicitly asks for a Gemini perspective.
4. **Delegate to codex** when: the task is reasoning-heavy or the user wants an
   OpenAI model's take.
5. **Parallel delegation:** You can call multiple sub-agents and synthesize their
   responses for a consensus answer.
6. **Always synthesize:** After receiving a sub-agent response, summarize and
   present it clearly to the user rather than dumping raw output.

---

## Authentication: OAuth/Session-Based (No API Keys!)

All sub-agents use **OAuth and session-based authentication** from CLI tools, not raw API keys:

| Agent | Auth Method | Setup Command |
|-------|-------------|-------|
| **Claude** | CLI OAuth session | `claude auth login` |
| **Gemini** | Google Application Default Credentials | `gcloud auth application-default login` |
| **Codex** | CLI OAuth session | `codex login` |

**Why CLI OAuth?**
- ✅ Usage counts against flat-rate Pro subscriptions (not metered API billing)
- ✅ No API keys anywhere in the project
- ✅ Uses each CLI's built-in OAuth authentication
- ✅ More secure and cost-effective

**First-time setup:**
```bash
# Authenticate each CLI (one-time)
claude auth login
gcloud auth application-default login
codex login

# Install MCP wrappers
bash layout/setup.sh

# Start using Megan
crush
```

---

## Example Delegation Prompts

When delegating, provide full context:
```
claude_code(prompt="""
Context: We're working on a Python FastAPI app in /Users/me/myapp.
Task: Refactor the authentication module (auth/main.py) to use JWT tokens 
instead of session cookies. Preserve existing tests. Run tests after.
""")
```
