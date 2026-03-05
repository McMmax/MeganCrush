# Model Capabilities & Cost Efficiency

This guide helps Megan choose the right model for any task based on capability and cost. Only the models listed below are available.

## GitHub Copilot Models (Free Unlimited)
- **`gpt-5mini`**: Small, fast, cheap. Good for quick answers, simple code generation.
- **`gpt-4.1`**: Strong all‑rounder. Use for most coding tasks when you need moderate reasoning.
- **`gpt-4o`**: Multimodal (text + vision), fast. Use when you need image understanding.

## GitHub Copilot Models (0.33x Usage Cost)
- **`gpt-5.1-codex-mini`**: Optimized for Codex, cheaper/faster but less capable than full Codex models. Use when you need a quick OpenAI‑family answer without tapping Codex weekly cap.
- **`claude-4.5-haiku`**: Avoid – wasteful of your limited Claude tokens. Use only if no other model can handle the task and you have no Claude budget left (unlikely).

## Codex Models (ChatGPT Pro)
- **`gpt-5.1-codex-mini`**: Optimized for CLI, fast, cheap. Default for Codex tasks.
- **`gpt-5.2`**: More capable, slower. Use for complex code generation.
- **`gpt-5.1-codex-max`**: Optimized for large outputs.
- **`gpt-5.2-codex`**: Frontier agentic coding model.
- **`gpt-5.3-codex`**: Latest frontier agentic coding model.
- **Caching**: All Codex models support prompt caching. After first request with a large context (e.g., your codebase), subsequent requests with similar context get 75% discount.

## Gemini Models (Google AI Pro)
- **`gemini-2.5-flash-lite`**: Fastest, cheapest. Use for quick answers, simple edits.
- **`gemini-2.5-flash`**: Fast, good for most tasks.
- **`gemini-2.5-pro`**: Best for complex reasoning, code generation, 1M context. Default for Gemini delegation.
- **`gemini-3-flash-preview`**: Preview of next‑gen flash model.
- **`gemini-3.1-pro-preview`**: Preview of next‑gen pro model with enhanced reasoning.

## Claude Models (Claude Pro, via Code CLI)
- **`Opus 4.6`**: Highest reasoning capability, slower. Use only for tasks requiring deep thought, novel solutions.
- **`Sonnet 4.6`**: Excellent balance of speed and reasoning. Default for Claude tasks when permission granted.
- **`claude-4.5-haiku`**: **Never use** – wasteful of your limited Claude tokens.

## Comparison: When to Use What

| Scenario | Recommended Model(s) | Rationale |
|----------|----------------------|-----------|
| Quick answer, planning | `gpt-5mini` or `gpt-4.1` (Copilot) | Free, fast, good enough |
| Codebase‑wide analysis | `gemini-2.5-pro` | 1M context, free daily |
| UI sketch → code | `gemini-2.5-pro` (multimodal) | Vision + coding |
| Algorithm challenge | Codex `gpt-5.1-codex-mini` or `gpt-5.2` | Optimized reasoning, caching |
| Multi‑file refactor | Claude Code (`Sonnet 4.6`) | Autonomous agent, but needs permission |
| Creative architecture | Claude Code (`Opus 4.6`) | Permission required |
| Repeated queries on same project | Codex (cached) | 75% discount after first |
| Daily “consciousness” (your main replies) | `gemini-2.5-pro` | 100/day, separate from others |