const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, "");
}

export function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function clampText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  const suffix = "\n\n[output truncated]";
  return `${value.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
}

export function splitForTelegram(value: string, maxChunkLength = 3900): string[] {
  if (value.length <= maxChunkLength) {
    return [value];
  }

  const chunks: string[] = [];
  let offset = 0;
  while (offset < value.length) {
    chunks.push(value.slice(offset, offset + maxChunkLength));
    offset += maxChunkLength;
  }
  return chunks;
}

export function formatCrushOutput(value: string, maxChars: number): string {
  const cleaned = clampText(normalizeNewlines(stripAnsi(value)).trim(), maxChars);
  if (cleaned.length === 0) {
    return "No output from Crush.";
  }

  return `\`\`\`\n${cleaned}\n\`\`\``;
}
