export function parseMultilineList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatMultilineList(values: string[]): string {
  return values.join("\n");
}

export function parseEnvLines(value: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of parseMultilineList(value)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const envValue = line.slice(separatorIndex + 1).trim();
    if (key) {
      env[key] = envValue;
    }
  }

  return env;
}

export function formatEnvLines(env: Record<string, string>): string {
  return Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}
