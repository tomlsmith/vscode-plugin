// vscode-oniguruma's typings reference these DOM-lib WebAssembly members,
// which the ES2022-only lib set does not declare. The grammar tests never use
// the custom-instantiator loadWASM overload, so minimal shapes are enough.
declare namespace WebAssembly {
  type ImportValue = unknown;

  interface WebAssemblyInstantiatedSource {
    readonly instance: unknown;
    readonly module: unknown;
  }
}
