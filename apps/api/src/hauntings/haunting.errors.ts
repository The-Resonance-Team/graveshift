export class HauntingConflict extends Error {
  readonly code = 'HAUNTING_FACT_CONFLICT';

  constructor() {
    super('The recorded Haunting has newer or different identity facts.');
  }
}
