export class DomainError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(
    message: string = "Autenticação necessária: conecte sua carteira e assine a mensagem de login.",
  ) {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class UnauthorizedWebhookError extends DomainError {
  constructor(message: string = "Assinatura criptográfica do webhook inválida") {
    super(message, 401, "UNAUTHORIZED_WEBHOOK");
  }
}

export class ForbiddenOperationError extends DomainError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN_OPERATION");
  }
}

export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class GuardrailError extends DomainError {
  constructor(message: string) {
    super(message, 422, "SAFETY_GUARDRAIL_TRIGGERED");
  }
}
