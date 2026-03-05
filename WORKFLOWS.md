# Example Workflows

This file illustrates how Megan should handle common user requests, demonstrating the decision process and delegation using only the allowed models.

## Example 1: “Refactor the auth module to use JWT”

1. **Analyze with `gpt-4.1` (free):** Determine scope (likely multiple files), check if tests exist.
2. **Decision:** This is a multi‑file refactor suitable for autonomous agent.
3. **Budget Check:** Claude tokens available? If yes, proceed to permission.
4. **Permission Prompt:** “This refactor requires Claude Sonnet for autonomous execution. Our Claude window has ~30k tokens left. Estimated cost: 15k tokens. OK?”
5. **If approved:** Call `claude_code(prompt="Refactor auth module to JWT, preserve tests", model="sonnet-4.6")`.
6. **Synthesize result:** Summarize changes, ask if user wants to review.

## Example 2: “Explain the entire project architecture”

1. **Analyze with `gpt-4.1`:** This requires reading many files – 1M context would help.
2. **Delegation:** Use `gemini-2.5-pro` (free, 100/day) for its 1M context.
3. **Call:** `gemini(prompt="Analyze all files in this project and describe the architecture.", model="gemini-2.5-pro")`
4. **Return:** Formatted architecture summary.

## Example 3: “Write a proof of concept for a new sorting algorithm”

1. **Analyze:** This is reasoning‑heavy, algorithmic.
2. **Delegation:** Codex models excel at this. Use `codex` with `gpt-5.2` (or `gpt-5.3-codex` for frontier).
3. **Call:** `codex(prompt="Implement a novel sorting algorithm in Python with explanation.", model="gpt-5.2")`
4. **Return:** Code + explanation.

## Example 4: “I have a screenshot of a UI; generate the React code”

1. **Analyze:** Multimodal needed.
2. **Delegation:** `gemini-2.5-pro` (multimodal) is best.
3. **Call:** `gemini(prompt="Generate React component from this UI sketch.", model="gemini-2.5-pro")` (Note: You’d need to pass image; currently MCP wrapper may need enhancement to handle files.)
4. **Return:** React code.

## Example 5: “We need a new caching layer design – brainstorm ideas”

1. **Analyze:** Creative, high‑level architecture – Claude Opus ideal.
2. **Permission Prompt:** “This brainstorming could benefit from Claude Opus’s reasoning. Estimated 20k tokens. Approve?”
3. **If approved:** `claude_code(prompt="Brainstorm caching layer designs with pros/cons.", model="opus-4.6")`
4. **Synthesize:** Present top ideas.

## Example 6: “Fix this bug in the payment service” (quick fix)

1. **Analyze:** Likely a small, localized change.
2. **Handle directly:** Use `gemini-2.5-pro` (if within daily limit) or even `gpt-4.1` to propose fix, then maybe ask user to apply it.
3. **No delegation needed.**