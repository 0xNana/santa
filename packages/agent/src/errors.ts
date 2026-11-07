/** A refusal written for the sender. Its message never holds the claim key or the link (C12). */
export class GiftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiftError";
  }
}
