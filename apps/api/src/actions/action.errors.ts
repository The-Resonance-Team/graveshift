export class ActionProjectError extends Error {
  constructor() {
    super('This project is not available on this host');
  }
}
