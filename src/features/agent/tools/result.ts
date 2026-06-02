/** Unified envelope returned by every tool and sent back to the model. */
export type ToolResultEnvelope<TData = unknown> =
  | {
      ok: true;
      tool: string;
      data: TData;
    }
  | {
      ok: false;
      tool: string;
      error: {
        code: string;
        message: string;
      };
    };

export function toolSuccess<TData>(
  tool: string,
  data: TData
): ToolResultEnvelope<TData> {
  return { ok: true, tool, data };
}

export function toolFailure(
  tool: string,
  code: string,
  message: string
): ToolResultEnvelope<never> {
  return { ok: false, tool, error: { code, message } };
}

export function serializeToolResult(result: ToolResultEnvelope): string {
  return JSON.stringify(result);
}
