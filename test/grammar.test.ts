import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, test } from "vitest";
import { loadWASM, OnigScanner, OnigString } from "vscode-oniguruma";
import {
  INITIAL,
  Registry,
  parseRawGrammar,
  type IGrammar,
  type StateStack,
} from "vscode-textmate";

const wasmPath = fileURLToPath(
  new URL("../node_modules/vscode-oniguruma/release/onig.wasm", import.meta.url),
);
const grammarPath = fileURLToPath(
  new URL("../syntaxes/toml.tmLanguage.json", import.meta.url),
);

let grammar: IGrammar;

beforeAll(async () => {
  await loadWASM(await readFile(wasmPath));
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources: string[]) => new OnigScanner(sources),
      createOnigString: (str: string) => new OnigString(str),
    }),
    loadGrammar: async (scopeName) => {
      if (scopeName !== "source.toml") {
        return null;
      }
      return parseRawGrammar(await readFile(grammarPath, "utf8"), grammarPath);
    },
  });
  const loaded = await registry.loadGrammar("source.toml");
  if (loaded === null) {
    throw new Error("failed to load the source.toml grammar");
  }
  grammar = loaded;
});

// Tokenizes the fixture as one document so rule state (multiline strings)
// carries across lines, and renders one "text scope..." entry per token.
function renderTokens(fixture: readonly string[]): string {
  const rendered: string[] = [];
  let ruleStack: StateStack = INITIAL;
  for (const line of fixture) {
    const result = grammar.tokenizeLine(line, ruleStack);
    ruleStack = result.ruleStack;
    rendered.push(`line ${JSON.stringify(line)}`);
    for (const token of result.tokens) {
      const text = line.slice(token.startIndex, token.endIndex);
      rendered.push(`  ${JSON.stringify(text)} ${token.scopes.join(" ")}`);
    }
  }
  return rendered.join("\n");
}

describe("TOML grammar tokenization", () => {
  test("table headers and array-of-tables headers", () => {
    expect(
      renderTokens([
        "[server]",
        "[dependencies.tokio]",
        '[servers."alpha.beta"]',
        "['literal segment'.gamma]",
        "[[bin]]",
        "[[fruit.apple.variety]]",
        '[[targets."cfg(unix)".dependencies]]',
      ]),
    ).toMatchSnapshot();
  });

  test("bare, dotted, and quoted keys", () => {
    expect(
      renderTokens([
        'name = "tomlsmith"',
        "bare_key-2 = 1",
        'physical.color = "orange"',
        'site."google.com" = true',
        "'quoted key'.\"another.one\" = 2",
      ]),
    ).toMatchSnapshot();
  });

  test("integers", () => {
    expect(
      renderTokens([
        "answer = 42",
        "negative = -17",
        "plus = +99",
        "zero = 0",
        "grouped = 1_000_000",
        "hex = 0xDEAD_beef",
        "octal = 0o755",
        "binary = 0b1101_0110",
      ]),
    ).toMatchSnapshot();
  });

  test("floats", () => {
    expect(
      renderTokens([
        "pi = 3.1415",
        "negative = -0.01",
        "exponent = 5e+22",
        "upper_exponent = 1E6",
        "both = 6.626e-34",
        "grouped = 224_617.445_991_228",
        "infinite = inf",
        "negative_infinity = -inf",
        "not_a_number = nan",
        "signed_nan = +nan",
      ]),
    ).toMatchSnapshot();
  });

  test("date-times, dates, and times", () => {
    expect(
      renderTokens([
        "offset_utc = 1979-05-27T07:32:00Z",
        "offset_numeric = 1979-05-27T00:32:00.999999-07:00",
        "offset_space = 1979-05-27 07:32:00Z",
        "local_date_time = 1979-05-27T07:32:00",
        "local_date = 1979-05-27",
        "local_time = 07:32:00",
        "local_time_fractional = 00:32:00.999999",
      ]),
    ).toMatchSnapshot();
  });

  test("booleans", () => {
    expect(renderTokens(["enabled = true", "disabled = false"])).toMatchSnapshot();
  });

  test("strings and escape sequences", () => {
    expect(
      renderTokens([
        'basic = "hello \\"world\\""',
        'escapes = "tab\\t newline\\n unicode \\u00E9 wide \\U0001F600 hex \\x41"',
        "literal = 'C:\\Users\\nodejs\\templates'",
        'multiline_basic = """',
        'first line \\"quoted\\"',
        'second line"""',
        "multiline_literal = '''",
        "raw \\n stays raw",
        "'''",
      ]),
    ).toMatchSnapshot();
  });

  test("inline tables and arrays", () => {
    expect(
      renderTokens([
        'point = { x = 1, y = -2, label = "origin" }',
        "nested = { inner = { list = [1, 2, 3] }, flag = true }",
        "matrix = [[1, 2], [\"a\", 'b'], { key = \"value\" }]",
        "moments = [2024-01-01, 07:32:00, 1979-05-27T07:32:00Z]",
      ]),
    ).toMatchSnapshot();
  });

  test("comments and hash characters inside strings", () => {
    expect(
      renderTokens([
        "# full-line comment",
        "port = 8080 # trailing comment",
        'path = "not # a comment" # actual comment',
        "literal_hash = '# not a comment either'",
      ]),
    ).toMatchSnapshot();
  });

  test("keys that resemble other token kinds", () => {
    expect(
      renderTokens(["2024-01-01 = true", 'true = "not a boolean"']),
    ).toMatchSnapshot();
  });

  test("Cargo.lock package block", () => {
    expect(
      renderTokens([
        "# This file is automatically @generated by Cargo.",
        "# It is not intended for manual editing.",
        "version = 4",
        "",
        "[[package]]",
        'name = "serde"',
        'version = "1.0.219"',
        'source = "registry+https://github.com/rust-lang/crates.io-index"',
        'checksum = "5f0e2c6ed6606019b4e29e69dbaba95b11854410e5347d525002456dbbb786b6"',
        "dependencies = [",
        ' "serde_derive",',
        "]",
      ]),
    ).toMatchSnapshot();
  });
});
