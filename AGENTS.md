# 代理与协作说明

## Git 提交规范（Conventional Commits）

本仓库遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，便于自动生成变更日志、 semver 与 Code Review。

### 提交标题格式（必填单行摘要）

```
<type>(<optional scope>): <简短描述>

# 正文与脚注可选：说明动机、破坏性变更等
```

- **type（类型）**：`feat`（新功能） | `fix`（修复） | `docs` | `style`（格式，不影响含义） | `refactor` | `perf` | `test` | `build` | `ci` | `chore` | `revert`
- **scope（范围）**：可选，小写名词，表示模块或路径片段，例如 `auth`、`api`、`ui`
- **描述**：祈使语气、简体中文或英文任选其一（全仓库保持一致即可），末尾不加句号；首字母小写（英文时）

示例：

```
feat(auth): 支持手机号一键登录

fix(ci): 修复预览环境镜像标签错误

docs: 补充本地开发环境变量说明

feat(api)!: 移除已废弃的 v1 用户信息字段
```

破坏性变更可使用标题中的 `!`（如上），或在脚注中写明：

```
BREAKING CHANGE: 客户端需改用新的用户接口字段名
```

生成 commit message 时应：

1. 第一行控制在约 **72** 字符内（含），类型与描述清晰。
2. 一次提交聚焦单一意图；大范围改动可拆多条提交或一条带清晰正文分点。
3. 不提交机密（密钥、token、个人路径）；不把无关大文件或未说明的自动生成物塞进同一提交标题声称的意图里。
