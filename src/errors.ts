export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'session not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'invalid state transition') {
    super(409, message);
    this.name = 'ConflictError';
  }
}
