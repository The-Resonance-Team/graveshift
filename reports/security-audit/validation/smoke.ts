const fs = await import('node:fs');
console.log(JSON.stringify({
  platform: process.platform,
  bun: Bun.version,
  targetReadable: fs.existsSync('/target/package.json'),
  scratchWritable: (() => { try { fs.writeFileSync('/scratch/probe', 'ok'); return true; } catch { return false; } })(),
  envKeys: Object.keys(process.env).sort(),
  limits: {
    memory: fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim(),
    pids: fs.readFileSync('/sys/fs/cgroup/pids.max', 'utf8').trim(),
    cpu: fs.readFileSync('/sys/fs/cgroup/cpu.max', 'utf8').trim(),
  },
}, null, 2));
