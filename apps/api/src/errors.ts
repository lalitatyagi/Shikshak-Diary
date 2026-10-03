export class HttpError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendHttpError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
): unknown {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ error: error.message });
  }
  throw error;
}
