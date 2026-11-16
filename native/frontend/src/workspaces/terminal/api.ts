import { desktop } from "../../platform/bridge";

export type TerminalProgram = "pwsh" | "codex" | "opencode";
export type TerminalInfo = { id: string; program: TerminalProgram; directory: string; taskId: string; ended: boolean; state: string; version: string; exitCode: number | null; mode:string;generation:number;observable:boolean;resumable:boolean;externalSessionId:string };
export type ExecutionResult={ref:string;version:number;text:string;seen:boolean};
type Output = { data: string; next: number; ended: boolean; reset: boolean; persistenceError: string };

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  if (!desktop) throw new Error("浏览器预览没有连接本机终端，请在 Chela 桌面端启动");
  return desktop.call("Terminal." + method, ...args);
}

export const terminalApi = {
  available: Boolean(desktop),
  list: () => desktop ? call<TerminalInfo[]>("List") : Promise.resolve([] as TerminalInfo[]),
  chooseDirectory: () => call<string>("ChooseDirectory"),
  start: (program: TerminalProgram, directory: string, taskId: string) => call<TerminalInfo>("Start", program, directory, taskId),
  startObserved:(program:TerminalProgram,directory:string,taskId:string,prompt:string)=>call<TerminalInfo>("StartObserved",program,directory,taskId,prompt),
  resume:(id:string,prompt:string)=>call<TerminalInfo>("Resume",id,prompt),
  results:(id:string)=>call<ExecutionResult[]>("Results",id),
  seenResult:(id:string,ref:string,version:number)=>call<void>("SeenResult",id,ref,version),
  read: (id: string, offset: number) => call<Output>("Read", id, offset),
  write: (id: string, input: string) => call<void>("Write", id, input),
  resize: (id: string, cols: number, rows: number) => call<void>("Resize", id, cols, rows),
  close: (id: string) => call<void>("Close", id),
};
