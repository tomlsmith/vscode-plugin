import { vi } from "vitest";

export const clients: LanguageClient[] = [];

export enum State {
  Stopped = 1,
  Running = 2,
  Starting = 3,
}

export interface StateChangeEvent {
  oldState: State;
  newState: State;
}

export class LanguageClient {
  readonly start = vi.fn(async () => undefined);
  readonly stop = vi.fn(async () => undefined);
  readonly sendNotification = vi.fn(
    async (_method: string, _params?: unknown) => undefined,
  );

  private readonly stateListeners = new Set<
    (event: StateChangeEvent) => void
  >();
  private state = State.Stopped;

  readonly onDidChangeState = vi.fn(
    (listener: (event: StateChangeEvent) => void) => {
      this.stateListeners.add(listener);
      return {
        dispose: vi.fn(() => {
          this.stateListeners.delete(listener);
        }),
      };
    },
  );

  constructor(
    readonly id: string,
    readonly name: string,
    readonly serverOptions: unknown,
    readonly clientOptions: unknown,
  ) {
    clients.push(this);
  }

  fireStateChange(newState: State): void {
    const event: StateChangeEvent = { oldState: this.state, newState };
    this.state = newState;
    for (const listener of [...this.stateListeners]) {
      listener(event);
    }
  }
}

export function resetLanguageClients(): void {
  clients.length = 0;
}
