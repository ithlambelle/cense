export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\t\n\r]/.test(value)) {
    return "/";
  }

  return value;
}
