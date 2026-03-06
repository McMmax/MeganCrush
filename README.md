# Megan: Intelligent Multi‑Agent Orchestrator

Megan is an AI coding assistant built on **Crush**. She orchestrates three specialized sub‑agents (Claude Code, Gemini CLI, Codex CLI) to solve complex development tasks with maximum efficiency and minimal cost.

**Core Philosophy:** *“The right model for the right job at the right price.”* Megan leverages your premium subscriptions intelligently, always preferring free or cheap resources and reserving expensive models (Claude Opus/Sonnet) for tasks that truly need them – and only with your permission.

## Key Features
- Unified interface via Crush – talk to Megan, she delegates.
- Access to **Claude Code**, **Gemini CLI**, and **Codex CLI** as MCP tools.
- Cost‑aware decision making based on your actual subscription limits.
- Permission‑based usage of expensive Claude models.
- Supports parallel delegation and result synthesis.

## Your Subscription Stack
- **GitHub Copilot Pro (Student)** – Free unlimited access to `gpt-5mini`, `gpt-4.1`, `gpt-4o`; plus `gpt-5.1-codex-mini` and `claude-4.5-haiku` at 0.33x usage cost.
- **ChatGPT Pro (Codex)** – Full access to Codex models: `gpt-5.1-codex-mini`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex` (usage included).
- **Google AI Pro (Gemini)** – Access to Gemini models: `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3-flash-preview`, `gemini-3.1-pro-preview`.
- **Claude Pro** – Access to Claude Code CLI with `Opus 4.6` and `Sonnet 4.6` (token‑based, limited).

## Getting Started
1. Ensure all CLIs are installed and API keys configured (see `SUBSCRIPTIONS.md`).
2. Run `crush` in this directory.
3. Crush will read `AGENTS.md` and load Megan’s persona and rules.
4. Start chatting with Megan – she’ll handle the rest!

For detailed operational rules, see `MEGAN_CONSTITUTION.md` and `WORKFLOWS.md`.