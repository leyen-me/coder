export function parseModelsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formatModelsText(models: readonly string[]): string {
  return models.join("\n");
}
