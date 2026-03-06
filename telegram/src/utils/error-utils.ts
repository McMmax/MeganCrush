export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function formatErrorForUser(error: unknown): string {
  const message = getErrorMessage(error);
  return `Request failed: ${message}`;
}
