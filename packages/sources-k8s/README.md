# Kubernetes Collector delivery

`createK8sCollector(options)` keeps its `Integration` lifecycle and inventory, log and health reads. Grave names remain `<configured service>__<namespace>__<deployment>`.

Each Collector owns one ordered delivery queue with room for 256 native observations. A failed publication retries the same prepared envelope with delays of 500 ms, 1 second and then doubling up to 30 seconds. Later observations wait. The delivery cursor and consumed event keys change only after all envelopes for that native observation are acknowledged. For a crash loop, this includes OOM enrichment when the pod lookup succeeds. A failed pod lookup remains best effort.

The Kubernetes watch API cannot pause callbacks. When the queue is full, the Collector closes that watch without consuming the frame it could not retain. It drains retained work, then starts a new watch from the last acknowledged resource version. Filtered events also pass through the queue. Neither an ignored event nor a full queue can advance the cursor past an undelivered observation.

`stop()` aborts acquisition and allows retained work up to one second to finish. It then cancels retries and detaches unresolved publication or enrichment work. Cancelled work cannot commit its cursor or publish enrichment after cancellation. The next `start()` on the same Collector replays from its acknowledged resource version. An already acknowledged crash envelope can be replayed if enrichment was unfinished; its stable id is unchanged.

Replay state belongs to this Collector instance and remains in memory. Changing its project or configured service clears that state. A vendor `410 Gone` still permits a gap: after retained work is delivered, the Collector acquires the current resource version. It does not recover history that Kubernetes has expired. A stop during failed retained delivery keeps the old cursor; it does not apply that reset. Connection notices are best effort and never move an observation cursor.
