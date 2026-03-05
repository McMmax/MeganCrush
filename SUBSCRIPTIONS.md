# Subscription Details & Limits

This file defines the exact limits of your paid subscriptions. Megan must refer to these when making delegation decisions.

## GitHub Copilot Pro (Student Plan)
- **Cost:** $0/month (educational)
- **Included Models (Unlimited, Free):** `gpt-5mini`, `gpt-4.1`, `gpt-4o`
- **Models with Usage Cost (0.33x):** `gpt-5.1-codex-mini`, `claude-4.5-haiku`
- **Usage Notes:** The unlimited models are the default workhorses. The cheap usage models should only be used when unlimited models are insufficient and you cannot delegate to a more appropriate sub‑agent. Prefer `gpt-5.1-codex-mini` over Haiku because Haiku consumes Claude quota unnecessarily.

## ChatGPT Pro (Codex)
- **Cost:** $200/month
- **Access:** Full Codex CLI suite, including:
  - `gpt-5.1-codex-mini` (optimized for Codex, cheaper/faster, less capable)
  - `gpt-5.2`
  - `gpt-5.1-codex-max` (Codex‑optimized)
  - `gpt-5.2-codex` (frontier agentic coding)
  - `gpt-5.3-codex` (latest frontier agentic coding)
- **Limits:** Weekly usage caps (exact numbers not public but generous). Most important: **Prompt caching** – 75% discount on repeated context after first use.
- **Strategy:** Use for projects with many similar queries; the caching advantage compounds over time. Default to `gpt-5.1-codex-mini` for speed/cost; escalate to higher models when needed.

## Google AI Pro (Gemini)
- **Cost:** $20/month
- **Daily Limits:**
  - `gemini-2.5-pro` and `gemini-3.1-pro-preview`: **100 prompts/day**
  - `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3-flash-preview`: **300 prompts/day** (or separate pools, effectively generous)
- **Context Window:** 1 million tokens (all models)
- **Multimodal:** Yes (images + text)
- **Notes:** These limits are separate, so you have plenty of daily capacity. Perfect for codebase analysis, complex reasoning, and daily tasks. Default to `gemini-2.5-pro` for most tasks; use flash models when speed is prioritized or Pro limit is near.

## Claude Pro
- **Cost:** $20/month
- **Access:** Claude Code CLI only (via `claude_code` MCP tool). Models: `Opus 4.6`, `Sonnet 4.6`. (Haiku is available but should be avoided.)
- **Limits:**
  - Rolling 5‑hour window: ~44,000 tokens (Pro)
  - Weekly ceiling: ~220,000 tokens (5× the window)
  - If using Agent Teams (multiple sub‑agents), token burn is ~3× faster.
- **Important:** Haiku is wasteful – never use it. Only Sonnet and Opus are permitted, and only after explicit user permission.

## Summary Table

| Provider | Cost | Key Limits | Best For |
|----------|------|------------|----------|
| GitHub Copilot (Student) | $0 | Unlimited `gpt-5mini`/`4.1`/`4o` | Daily work, planning, simple tasks |
| ChatGPT Pro | $200/mo | Weekly cap, caching | Long projects, algorithms, OpenAI reasoning |
| Google AI Pro | $20/mo | 100 Pro + 300 Flash/day | Codebase analysis, multimodal, daily thinking |
| Claude Pro | $20/mo | ~44K tokens/5h | Strategic reasoning (with permission) |