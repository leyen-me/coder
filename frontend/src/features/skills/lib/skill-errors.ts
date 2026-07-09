export class SkillReferenceValidationError extends Error {
  readonly code: "not_found";
  readonly slug: string;

  constructor(code: "not_found", slug: string) {
    super(code);
    this.name = "SkillReferenceValidationError";
    this.code = code;
    this.slug = slug;
  }
}

export function isSkillReferenceValidationError(
  error: unknown
): error is SkillReferenceValidationError {
  return error instanceof SkillReferenceValidationError;
}
