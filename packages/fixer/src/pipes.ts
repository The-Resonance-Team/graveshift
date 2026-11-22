/**
 * One bounded pipe read. Memory stays under the cap and the reader can be
 * cancelled, so neither a chatty check nor a grandchild that inherited the pipe
 * can grow the buffer or hold a fix run open.
 */
export interface CappedRead {
  /** Resolves when the pipe reached its end, or was cancelled. */
  readonly done: Promise<void>;
  readonly result: { text: string; truncated: boolean };
  /**
   * Stop reading for good: no further read is started and the stream reader is
   * cancelled, so a process that survived its parent cannot keep the pump alive.
   */
  cancel(): void;
}

const noPipe = (): CappedRead => ({
  done: Promise.resolve(),
  result: { text: '', truncated: false },
  cancel() {
    /* nothing was ever read */
  },
});

/**
 * Read one pipe with memory held to the cap: the first `cap` bytes are kept and
 * the rest is drained without storing it. The caller puts a deadline on `done`
 * and calls `cancel()` when it expires.
 */
export function readCapped(stream: ReadableStream<Uint8Array> | null, cap: number): CappedRead {
  if (stream === null) return noPipe();
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const result = { text: '', truncated: false };
  let kept = '';
  let keptBytes = 0;
  let stopped = false;

  const pump = async (): Promise<void> => {
    if (stopped) return;
    const next = await reader.read().catch(() => ({ done: true, value: undefined }));
    if (stopped) return;
    if (next.done === true) {
      result.text = kept + decoder.decode();
      return;
    }
    const bytes = next.value ?? new Uint8Array(0);
    if (keptBytes >= cap) {
      result.truncated = true;
      return pump();
    }
    const remaining = cap - keptBytes;
    const piece = bytes.byteLength > remaining ? bytes.subarray(0, remaining) : bytes;
    keptBytes += piece.byteLength;
    kept += decoder.decode(piece, { stream: true });
    result.text = kept;
    if (bytes.byteLength > remaining) result.truncated = true;
    return pump();
  };

  return {
    done: pump(),
    result,
    cancel() {
      if (stopped) return;
      stopped = true;
      result.truncated = true;
      void reader.cancel().catch(() => undefined);
    },
  };
}

/** Resolves `'expired'` once the bounded wait is over. */
export function after(ms: number): Promise<'expired'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      clearTimeout(timer);
      resolve('expired');
    }, ms);
  });
}
