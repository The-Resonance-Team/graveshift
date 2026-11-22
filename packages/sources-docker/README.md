# Docker Collector delivery

`createDockerCollector(options)` keeps its `Integration` lifecycle and inventory, log and health reads.

Each Collector owns one ordered delivery queue. It retains at most 256 native observations and pauses the Docker reader when full. The reader can hold one additional pulled frame while it waits for room. A failed publication retries the same prepared envelope, including its id, trace and observation time. Retry delays start at 500 ms, double after each failure and stop increasing at 30 seconds. Later observations wait for the head of the queue.

The replay cursor and the keys consumed at that Docker second change only after publication acknowledgement. Filtered native events pass through the same queue, so they cannot move the cursor past an earlier failed observation. Invalid envelope preparation also leaves the observation uncommitted and blocks later delivery.

`stop()` aborts the reader and allows retained observations up to one second to finish delivery. After that deadline it cancels retries and detaches unresolved publication work. Cancelled work cannot commit its cursor, even if its publisher later resolves. The next `start()` on the same Collector resumes at the last acknowledged second. When no observation has been acknowledged, it resumes at the first retained observation's second. Stable ids make replay safe for broker deduplication.

Replay state belongs to this Collector instance and remains in memory. It is cleared when project or configured Collector service changes. Recovery depends on the Docker daemon retaining the native events. Connection notices are best effort and never move an observation cursor.
