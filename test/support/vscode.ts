import { vi } from "vitest";

export interface ConfigurationInspection {
  globalValue?: unknown;
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
  globalLanguageValue?: unknown;
  workspaceLanguageValue?: unknown;
  workspaceFolderLanguageValue?: unknown;
}

const values = new Map<string, unknown>();
const inspections = new Map<string, ConfigurationInspection>();
const commandHandlers = new Map<string, () => Promise<void>>();
const configurationListeners = new Set<
  (event: { affectsConfiguration(section: string): boolean }) => unknown
>();

export const workspace = {
  isTrusted: true,
  getConfiguration: vi.fn(() => ({
    get<T>(key: string, fallback: T): T {
      return (values.has(key) ? values.get(key) : fallback) as T;
    },
    inspect(key: string): ConfigurationInspection | undefined {
      return inspections.get(key);
    },
  })),
  onDidChangeConfiguration: vi.fn(
    (
      listener: (event: {
        affectsConfiguration(section: string): boolean;
      }) => unknown,
    ) => {
      configurationListeners.add(listener);
      return {
        dispose: vi.fn(() => {
          configurationListeners.delete(listener);
        }),
      };
    },
  ),
};

export const commands = {
  registerCommand: vi.fn(
    (command: string, handler: () => Promise<void>) => {
      commandHandlers.set(command, handler);
      return { dispose: vi.fn() };
    },
  ),
  executeCommand: vi.fn(async () => undefined),
};

export const window = {
  showErrorMessage: vi.fn(async () => undefined),
};

export enum LanguageStatusSeverity {
  Information = 0,
  Warning = 1,
  Error = 2,
}

export interface LanguageStatusItem {
  readonly id: string;
  readonly selector: unknown;
  name: string | undefined;
  text: string;
  detail: string | undefined;
  busy: boolean;
  severity: LanguageStatusSeverity;
  command: { title: string; command: string } | undefined;
  dispose(): void;
}

export const languageStatusItems: LanguageStatusItem[] = [];

export const languages = {
  createLanguageStatusItem: vi.fn((id: string, selector: unknown) => {
    const item: LanguageStatusItem = {
      id,
      selector,
      name: undefined,
      text: "",
      detail: undefined,
      busy: false,
      severity: LanguageStatusSeverity.Information,
      command: undefined,
      dispose: vi.fn(),
    };
    languageStatusItems.push(item);
    return item;
  }),
};

export function setConfiguration(next: Readonly<Record<string, unknown>>): void {
  values.clear();
  for (const [key, value] of Object.entries(next)) {
    values.set(key, value);
  }
}

export function setConfigurationInspection(
  key: string,
  inspection: ConfigurationInspection,
): void {
  inspections.set(key, inspection);
}

export function setWorkspaceTrust(trusted: boolean): void {
  workspace.isTrusted = trusted;
}

export async function fireConfigurationChange(
  changedSections: readonly string[],
): Promise<void> {
  const event = {
    affectsConfiguration(section: string): boolean {
      return changedSections.some(
        (changed) => changed === section || changed.startsWith(`${section}.`),
      );
    },
  };
  await Promise.all(
    [...configurationListeners].map((listener) => listener(event)),
  );
}

export function resetVscode(): void {
  workspace.isTrusted = true;
  values.clear();
  inspections.clear();
  commandHandlers.clear();
  configurationListeners.clear();
  languageStatusItems.length = 0;
  workspace.getConfiguration.mockClear();
  workspace.onDidChangeConfiguration.mockClear();
  commands.registerCommand.mockClear();
  commands.executeCommand.mockClear();
  window.showErrorMessage.mockClear();
  languages.createLanguageStatusItem.mockClear();
}
