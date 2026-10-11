export class NotImplementedError extends Error {
  constructor(name: string) {
    super(`${name} is not implemented yet.`);
    this.name = "NotImplementedError";
  }
}
