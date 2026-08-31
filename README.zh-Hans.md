# TomlSmith for VS Code

[English](README.md) | **简体中文**

[![CI](https://github.com/tomlsmith/vscode-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/tomlsmith/vscode-plugin/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**在 VS Code 中检查和格式化 TOML。**

TomlSmith for VS Code 使用 [TomlSmith](https://github.com/tomlsmith/tomlsmith) 处理 `.toml` 文件，以及 `Cargo.lock`、`Pipfile` 等指定文件名，支持 TOML 1.0 与 1.1。

## 主要功能

- 编辑 TOML 文件时查看错误与警告，并在 VS Code 的**问题**面板中看到稳定的诊断代码。
- 使用 VS Code 的 **格式化文档** 操作。扩展会应用语言服务器返回的编辑，而不是替换整个文档。
- 使用 TextMate 与语义 token 高亮键、值、表、注释和字面量；普通表、表数组、标量值键、数组值键、内联表值键和内联表成员键具有不同分类。
- 悬停时查看键路径和 TOML 值类型。
- 通过**大纲**、面包屑和**转到编辑器中的符号**浏览由普通表、表数组和键组成的层级符号树，包括表声明顺序不规则的文档。
- 折叠普通表、表数组、多行数组以及 TOML 1.1 多行内联表。
- 默认按 TOML 1.1 校验；文件必须交给仅支持 1.0 的工具读取时，可以选择严格 TOML 1.0。
- 配置缩进、首选行宽、换行符，以及是否格式化生成文件。

扩展暂不提供重命名重构、补全、Schema 集成和代码操作。从 Even Better TOML 迁移？请参阅[迁移说明](docs/even-better-toml.md)。

## 支持的文件

扩展为 `.toml` 文件以及这些文件名注册 TOML：`Cargo.lock`、`Pipfile`、`uv.lock`、`poetry.lock` 和 `pdm.lock`。

## 语法颜色

TomlSmith 继续使用 VS Code 标准的 `property` 和 `namespace` 语义 token 类型表示键与表头，并为数组值键、内联表值键、内联表成员键和表数组附加 TOML 专用 modifier。这样主题仍能继承标准颜色，同时用户可以单独覆盖每种 TOML 结构。

使用 Dark+ 时，TomlSmith 默认把内联表成员键显示为青色 `#4FC1FF`，外层属性键继续使用 Dark+ 的浅蓝色，表头继续使用 namespace 的蓝绿色。该默认值只作用于 TOML，并同时匹配新名称 `Dark+` 和旧名称 `Default Dark+`；用户或工作区颜色设置仍然拥有更高优先级。下面的示例可以定制完整配色：

```json
{
  "editor.semanticTokenColorCustomizations": {
    "[Dark+][Default Dark+]": {
      "enabled": true,
      "rules": {
        "property:toml": "#9CDCFE",
        "property.tomlArray:toml": "#569CD6",
        "property.tomlInlineTable:toml": "#9CDCFE",
        "property.tomlInlineTableMember:toml": "#4FC1FF",
        "property.tomlArray.tomlInlineTableMember:toml": "#4FC1FF",
        "property.tomlInlineTable.tomlInlineTableMember:toml": "#4FC1FF",
        "namespace:toml": "#4EC9B0",
        "namespace.tomlArrayTable:toml": "#569CD6",
        "tomlDateTime:toml": "#DCDCAA",
        "tomlInvalid:toml": {
          "foreground": "#F44747",
          "underline": true
        }
      }
    }
  }
}
```

如果希望对所有主题生效，可以去掉 `[Dark+][Default Dark+]` 包装，并把 `enabled` 和 `rules` 直接放到 `editor.semanticTokenColorCustomizations` 下。匹配的 TextMate scope 会在语言服务器尚未启动或语义高亮关闭时提供相同的结构化回退。可以通过 **Developer: Inspect Editor Tokens and Scopes** 查看光标位置实际使用的 selector 和最终生效的颜色规则。

## 配置语言服务器

Marketplace 与 GitHub Release 为 macOS x64/arm64、非 Alpine Linux x64/arm64 和 Windows x64 提供分平台安装包。匹配的安装包都内置兼容的 `tomlsmith-lsp`，因此不需要另外配置服务器。VS Code 在受支持的 Remote-SSH、WSL 或 Dev Container 环境中把扩展安装到工作区侧时也是如此。

Marketplace 还为上述范围外的环境（包括 Alpine 与 Windows Arm64）提供不指定平台的通用 fallback。这个 fallback 刻意不包含可执行文件；请按下文从 crates.io 安装 `tomlsmith-lsp`，并显式配置路径或让它出现在 `PATH` 中。

扩展通过 `tomlsmith-lsp` 可执行文件工作，按以下顺序解析：

1. 显式配置的 `tomlsmith.server.path` 设置。
2. 扩展安装包中内置的、匹配当前平台的服务器二进制（如果存在）。
3. `PATH` 中的 `tomlsmith-lsp`。

进行扩展开发或使用内置包不覆盖的平台时，如果既没有内置服务器二进制、`PATH` 上也找不到，可以安装正式发布的 server crate：

1. 从 crates.io 安装最新稳定版服务器：

   ```bash
   cargo install tomlsmith-lsp --locked
   ```

2. 让扩展找到它——保留 Cargo bin 目录在 `PATH` 中，或在设置中指定二进制路径：

   ```json
   {
     "tomlsmith.server.path": "/absolute/path/to/tomlsmith-lsp"
   }
   ```

如果服务器启动失败，扩展会提示执行失败的命令。修正 `tomlsmith.server.path` 后无需重新加载窗口即可生效。

打包者可以使用 `pnpm bundle-server --binary <path-to-tomlsmith-lsp>` 将构建好的二进制暂存到本地打包的 VSIX 中，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

扩展源码开发说明请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 设置

| 设置 | 默认值 | 生效方式 | 用途 |
| --- | --- | --- | --- |
| `tomlsmith.server.path` | `tomlsmith-lsp` | 重启服务器 | 语言服务器命令或绝对路径；未显式设置时，优先使用内置服务器二进制，然后才查找 `PATH` |
| `tomlsmith.server.arguments` | `[]` | 重启服务器 | 传递给 `tomlsmith-lsp` 的附加参数 |
| `tomlsmith.server.environment` | `{}` | 重启服务器 | 启动 `tomlsmith-lsp` 时附加的环境变量 |
| `tomlsmith.toml.version` | `1.1` | 立即生效 | 诊断和格式化使用的 TOML 版本；只有文件必须由仅支持 1.0 的消费端读取时才需要显式选择 1.0 |
| `tomlsmith.format.indentWidth` | `null` | 立即生效 | 格式化缩进宽度；`null` 表示跟随编辑器的 tab 大小 |
| `tomlsmith.format.lineWidth` | `100` | 立即生效 | 格式化首选行宽 |
| `tomlsmith.format.lineEnding` | `preserve` | 立即生效 | 保留、LF 或 CRLF 换行符 |
| `tomlsmith.format.generatedFiles` | `skip` | 立即生效 | **格式化文档** 是否处理生成文件 |

修改任意 `tomlsmith.server.*` 设置会自动重启语言服务器；`tomlsmith.toml.version` 和 `tomlsmith.format.*` 设置会推送到正在运行的服务器，无需重启即可生效。

在受限模式（Restricted Mode）下，工作区级别对 `tomlsmith.server.path`、`tomlsmith.server.arguments` 和 `tomlsmith.server.environment` 的覆盖会被忽略。

## 格式化行为

- 默认情况下，**格式化文档** 会跳过生成文件：`Cargo.lock`、`uv.lock`、`poetry.lock`、`pdm.lock` 这些锁文件，以及文件开头注释带有 `@generated` 之类标记的文件。将 `tomlsmith.format.generatedFiles` 设为 `format` 可以照常格式化它们。
- 存在语法错误的文档不会被格式化。原因会写入 TomlSmith 输出日志，不会弹出通知。

## 语言状态

打开 TOML 文件时，语言状态区域（状态栏中的 `{}` 指示器）会出现 **TomlSmith** 条目，显示服务器状态——正在启动、运行中、已停止，或失败及其详细原因——并提供 **Restart Server** 操作。

## 命令

- **TomlSmith: Restart Language Server** — 按需重启当前语言服务器进程。

## 致谢

[Even Better TOML](https://marketplace.visualstudio.com/items?itemName=tamasfe.even-better-toml) 及其底层的 [Taplo](https://github.com/tamasfe/taplo) 语言工具帮助建立了用户对 TOML 编辑体验的预期，也启发了 TomlSmith 针对折叠、符号导航、重构和 Schema 智能所做的能力差距清单。TomlSmith 是独立实现；感谢 Tamás Fehér 与所有 Taplo 贡献者持续推进 TOML 工具生态。

## 参与贡献

提交 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。参与项目需要遵守 [行为准则](CODE_OF_CONDUCT.md)。

## 许可证

TomlSmith for VS Code 依据 [MIT License](LICENSE) 发布。
