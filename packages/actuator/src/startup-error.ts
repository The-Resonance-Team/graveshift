/** Returns only the error code for startup failure logs. No path or raw error text. */
export function admissionErrorCode(error: unknown): string {
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return 'UNKNOWN';
}
