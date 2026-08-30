# Even Better TOML migration notes

These notes compare TomlSmith for VS Code with [Even Better TOML](https://marketplace.visualstudio.com/items?itemName=tamasfe.even-better-toml) so switchers know what to expect. They describe the current extension behavior and may lag behind either project.

## What TomlSmith for VS Code has today

- Version-aware diagnostics: documents are validated as TOML 1.0 by default, and `tomlsmith.toml.version` switches validation and formatting to TOML 1.1 without a server restart.
- A formatter that applies minimal edits instead of rewriting the whole document, refuses to format a document with syntax errors (logging the refusal instead of showing a popup), and by default skips generated files such as `Cargo.lock` or files marked `@generated`.
- A hierarchical document outline for tables, arrays of tables, and keys.
- Folding for tables, arrays of tables, and multi-line arrays and inline tables.
- Hover showing a key's dotted path and TOML value kind.
- Semantic highlighting produced by the same parser that reports the diagnostics.

## What Even Better TOML has that TomlSmith lacks

- JSON Schema support backed by the schema store: schema-driven completion, validation, and hover documentation.
- Code actions.
- Key sorting during formatting.

If your workflow depends on schema-backed completion or validation for files such as `pyproject.toml`, keep Even Better TOML for now.

## Running both extensions

Both extensions register a formatter and diagnostics for the `toml` language. Pin the formatter per language so VS Code does not have to ask:

```json
{
  "[toml]": {
    "editor.defaultFormatter": "tomlsmith.tomlsmith"
  }
}
```

Use `"tamasfe.even-better-toml"` as the value to keep Even Better TOML as the formatter instead. Diagnostics from both extensions stay active while both are enabled, so the same error can be reported twice; disable one of the extensions per workspace if the duplication is distracting.
