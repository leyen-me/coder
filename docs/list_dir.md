如果你是在做一个 **通用 Agent + Code Agent** 的工具系统，`list_dir` 看起来简单，但其实会影响后面所有文件工具（read_file、write_file、search_files、run_code）的设计。

我的建议是：

## 1. path 参数同时支持相对路径和绝对路径

不要限制只能绝对路径。

例如：

```json
{
  "path": "."
}
```

```json
{
  "path": "src"
}
```

```json
{
  "path": "/workspace/project/src"
}
```

Agent 更喜欢用相对路径，因为它会频繁执行：

```
list_dir(".")
list_dir("src")
read_file("src/main.py")
```

而不是每次都：

```
read_file("/workspace/project/src/main.py")
```

---

## 2. Agent 内部统一转换成绝对路径

例如设定：

```text
workspace_root = /workspace/project
```

用户：

```json
{
  "path": "src"
}
```

工具内部：

```python
abs_path = os.path.abspath(
    os.path.join(workspace_root, path)
)
```

最终变成：

```text
/workspace/project/src
```

这样后续所有工具都基于绝对路径运行。

---

## 3. 必须做路径逃逸检查

否则 Agent 能访问：

```text
../../../../etc
```

例如：

```python
resolved = os.path.realpath(abs_path)

if not resolved.startswith(workspace_root):
    raise PermissionError()
```

禁止访问：

```text
/etc
/root
/home
```

只允许：

```text
/workspace/project/**
```

很多 Code Agent（Claude Code、Cursor、OpenAI Codex）都是这么做的。

---

## 4. 返回结构不要只返回文件名

很多人一开始设计成：

```json
[
  "main.py",
  "README.md"
]
```

后面 Agent 很难推理。

建议返回：

```json
{
  "path": "/workspace/project",
  "entries": [
    {
      "name": "src",
      "type": "directory"
    },
    {
      "name": "README.md",
      "type": "file",
      "size": 1234
    }
  ]
}
```

或者：

```json
{
  "entries": [
    {
      "name": "src",
      "path": "src",
      "is_dir": true
    },
    {
      "name": "README.md",
      "path": "README.md",
      "is_dir": false,
      "size": 1234
    }
  ]
}
```

这样 Agent 下一步可以直接：

```text
read_file("README.md")
list_dir("src")
```

---

## 5. 推荐参数设计

最实用的是：

```json
{
  "path": ".",
  "recursive": false,
  "max_depth": 1,
  "show_hidden": false
}
```

定义：

| 参数          | 作用       |
| ----------- | -------- |
| path        | 相对或绝对路径  |
| recursive   | 是否递归     |
| max_depth   | 最大递归深度   |
| show_hidden | 是否显示隐藏文件 |

---

## 6. 给 LLM 的 Tool Schema

我会直接这样设计：

```json
{
  "name": "list_dir",
  "description": "List files and directories under a path.",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {
        "type": "string",
        "description": "Relative or absolute path."
      },
      "recursive": {
        "type": "boolean",
        "default": false
      }
    },
    "required": ["path"]
  }
}
```

然后在 Tool Description 里明确写：

> Relative paths are resolved against the workspace root.

这样模型会非常稳定地使用：

```json
{"path":"."}
```

```json
{"path":"src"}
```

而不是胡乱猜绝对路径。

---

如果你的目标是做一个类似 **Claude Code / Codex CLI / Cursor Agent** 的 Code Agent，我甚至建议直接统一所有文件工具：

```text
list_dir(path)
read_file(path)
write_file(path)
grep(query, path)
find_files(pattern, path)
```

全部使用「相对于 workspace root 的路径」。

这是目前实践中最适合 Agent 推理和规划的方式。
