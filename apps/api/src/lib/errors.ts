/** A request that named something that does not exist. Mapped to 404 by the handler. */
export class NotFoundError extends Error {
  constructor(public readonly resource: string) {
    super(`${resource} not found`);
    this.name = "NotFoundError";
  }
}

/** A request the caller could fix. Mapped to 400. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}
