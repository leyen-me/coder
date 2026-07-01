export function toolSuccess(tool: string, data: unknown): { ok: true; tool: string; data: unknown } {
  return { ok: true, tool, data };
}

export function toolFailure(
  tool: string,
  code: string,
  message: string,
): { ok: false; tool: string; error: { code: string; message: string } } {
  return {
    ok: false,
    tool,
    error: { code, message },
  };
}
