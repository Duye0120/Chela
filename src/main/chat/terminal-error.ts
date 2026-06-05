type TerminalErrorSource = {
  getPendingTerminalErrorMessage(): string | null;
};

export function throwIfPendingTerminalError(adapter: TerminalErrorSource): void {
  const terminalError = adapter.getPendingTerminalErrorMessage();
  if (terminalError) {
    throw new Error(terminalError);
  }
}
