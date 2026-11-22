import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { runSandboxed, sandboxEnv } from './sandbox';

test.skipIf(process.platform !== 'darwin')(
  'macOS checks cannot signal or inspect a disposable host process',
  async () => {
    const parent = join(tmpdir(), 'opencode');
    await mkdir(parent, { recursive: true });
    const root = await mkdtemp(join(await realpath(parent), 'fixer-process-'));
    const ready = Promise.withResolvers<void>();
    const alive = Promise.withResolvers<void>();
    let signalled = false;
    const victim = Bun.spawn(
      [
        process.execPath,
        '-e',
        [
          `process.on('SIGTERM', () => process.send({type:'signalled'}));`,
          `process.on('message', message => { if(message === 'ping') process.send({type:'alive'}); });`,
          `setInterval(() => {}, 1000);`,
          `process.send({type:'ready'});`,
        ].join('\n'),
        'fixer-disposable-victim',
      ],
      {
        env: sandboxEnv(root),
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 5000,
        killSignal: 'SIGKILL',
        serialization: 'json',
        ipc(message) {
          if (message.type === 'ready') ready.resolve();
          if (message.type === 'alive') alive.resolve();
          if (message.type === 'signalled') signalled = true;
        },
      },
    );
    const exited = victim.exited.then(() => {
      throw new Error('disposable host process exited too early');
    });
    const script = [
      `import {spawn} from 'node:child_process';`,
      `let stage='host signal'; try {`,
      `let denied=false;`,
      `try { process.kill(${victim.pid}, 'SIGTERM'); } catch(error) { denied=error.code==='EPERM'; }`,
      `if(!denied)process.exit(11);`,
      `process.kill(process.pid, 0);`,
      `stage='host inspection';`,
      `let listing=''; try {`,
      ` const inspection=Bun.spawn(['/bin/ps','-p','${victim.pid}','-o','command='],{stdout:'pipe',stderr:'ignore'});`,
      ` listing=await new Response(inspection.stdout).text(); await inspection.exited;`,
      `} catch(error) { if(error.code!=='EPERM')throw error; }`,
      `if(listing.includes('fixer-disposable-victim'))process.exit(12);`,
      `stage='child command';`,
      `const child=Bun.spawn([process.execPath,'-e',"process.stdout.write('child-ok')"],{stdout:'pipe',stderr:'ignore'});`,
      `if(await new Response(child.stdout).text()!=='child-ok'||await child.exited!==0)process.exit(13);`,
      `stage='child process group';`,
      `await new Promise((resolve,reject)=>{`,
      ` const group=spawn('/bin/sleep',['10'],{detached:true,stdio:'ignore'});`,
      ` group.once('error',reject); group.once('exit',(code,signal)=>signal==='SIGTERM'?resolve():reject(new Error('child group was not terminated')));`,
      ` group.once('spawn',()=>{ try {process.kill(-group.pid,'SIGTERM');}catch(error){reject(error);} });`,
      `});`,
      `} catch(error) {process.stdout.write(JSON.stringify({stage,code:error.code,message:error.message}));process.exit(14);}`,
    ].join('\n');
    try {
      await Promise.race([ready.promise, exited]);
      const result = await runSandboxed({
        argv: [process.execPath, '-e', script],
        root,
        cwd: root,
        env: sandboxEnv(root),
        timeoutMs: 3000,
        noNetwork: true,
      });
      expect(result).toMatchObject({ exitCode: 0, timedOut: false });
      victim.send('ping');
      await Promise.race([alive.promise, exited]);
      expect(signalled).toBe(false);
      expect(victim.exitCode).toBeNull();
    } finally {
      victim.kill('SIGKILL');
      await victim.exited;
      await rm(root, { recursive: true, force: true });
    }
  },
);
