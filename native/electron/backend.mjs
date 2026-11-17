import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function startBackend(executable, profile, onHostCall, log) {
  const child = spawn(executable, [], {
    env: { ...process.env, CHELA_SHELL_PROFILE: profile },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let serial = 0, closed = false;
  const pending = new Map();
  let finishExit;
  const exited = new Promise(resolve => { finishExit = resolve; });
  const fail = problem => {
    closed = true;
    for (const { reject } of pending.values()) reject(problem);
    pending.clear();
  };
  child.on("error", error => { fail(error); finishExit(); });
  child.on("exit", (code, signal) => {
    fail(Error(`Chela 后端已退出 (${code ?? signal})`));
  });
  child.on("close", () => finishExit());
  child.stderr.on("data", data => log.write(data));
  const send = value => new Promise((resolve, reject) => {
    if (closed || child.stdin.destroyed || child.stdin.writableEnded) return reject(Error("Chela 后端已断开"));
    child.stdin.write(JSON.stringify(value) + "\n", error => error ? reject(error) : resolve());
  });
  child.stdin.on("error", fail);
  const lines = createInterface({ input: child.stdout });
  lines.on("line", line => {
    let value;
    try { value = JSON.parse(line); }
    catch { fail(Error("Chela 后端协议无效")); child.kill(); return; }
    if (value.hostId) {
      Promise.resolve().then(() => onHostCall(value.method, value.args ?? []))
        .then(result => send({ hostId: value.hostId, value: result ?? null }),
          error => send({ hostId: value.hostId, error: error instanceof Error ? error.message : String(error) }))
        .catch(fail);
      return;
    }
    const request = pending.get(value.id);
    if (!request) return;
    pending.delete(value.id);
    if (value.error) request.reject(Error(value.error)); else request.resolve(value.value);
  });
  return {
    child,
    exited,
    call(method, ...args) {
      return new Promise((resolve, reject) => {
        if (closed) return reject(Error("Chela 后端已断开，请重新启动应用"));
        const id = ++serial;
        pending.set(id, { resolve, reject });
        send({ id, method, args }).catch(error => { pending.delete(id); reject(error); });
      });
    },
    async stop() {
      if (!closed) child.stdin.end();
      let timer;
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { child.kill(); resolve(); }, 8000); })]);
      clearTimeout(timer);
      lines.close();
    },
  };
}
