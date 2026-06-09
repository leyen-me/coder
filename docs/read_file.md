你已经进入 Code Agent 真正有难度的部分了。

很多人把 `read_file(path)` 做成：

```python
open(path).read()
```

然后 Agent 一跑项目就崩：

* 一个日志文件 500MB
* 一个 mp4 2GB
* 一个 sqlite 数据库
* 一个 utf16 文件
* 一个 .env
* 一个 node_modules 巨大文件

所以现代 Code Agent（Claude Code、Codex、Cursor、Aider）实际上都不是简单 read_file，而是：

```text
read_file = 安全边界
          + 编码检测
          + 二进制检测
          + 分块读取
          + 行号
          + 截断策略
```

---

# 我推荐的接口

```json
{
  "path": "src/main.py",
  "start_line": 1,
  "max_lines": 500
}
```

而不是：

```json
{
  "path": "src/main.py"
}
```

因为 Agent 经常需要：

```text
先读 1-300 行
再读 301-600 行
再读 601-900 行
```

否则上下文会爆炸。

---

# 返回结构

```json
{
  "path": "src/main.py",
  "encoding": "utf-8",
  "total_lines": 2380,
  "start_line": 1,
  "end_line": 300,
  "truncated": true,
  "content": "..."
}
```

Agent 立刻知道：

```text
文件还有后续内容
需要继续读
```

---

# 行号

不要让 LLM 自己数。

返回：

```text
1 | import os
2 | import json
3 |
4 | def main():
5 |     pass
```

原因：

Agent 后面会产生：

```text
修改第 184 行
修复第 220 行
```

没有行号非常痛苦。

---

# 大文件怎么办

推荐双限制：

```python
MAX_BYTES = 256 * 1024
MAX_LINES = 1000
```

例如：

```text
> 256KB
```

直接：

```json
{
  "error": "FILE_TOO_LARGE",
  "size": 18456789
}
```

或者：

```json
{
  "truncated": true,
  "content": "..."
}
```

Claude Code 基本是第二种。

---

# 最好的方案

支持分页：

```json
{
  "path": "server.log",
  "start_line": 1,
  "max_lines": 200
}
```

然后：

```json
{
  "path": "server.log",
  "start_line": 201,
  "max_lines": 200
}
```

Agent 可以自己翻页。

---

# 二进制检测

不要靠扩展名。

错误示范：

```python
if path.endswith(".png"):
```

正确：

读取前几 KB：

```python
chunk = open(path, "rb").read(4096)
```

检查：

```python
b"\x00" in chunk
```

或者：

```python
大量不可打印字符
```

例如：

```python
binary_ratio > 0.3
```

直接：

```json
{
  "error": "BINARY_FILE"
}
```

---

# 更高级一点

返回：

```json
{
  "error": "BINARY_FILE",
  "mime_type": "image/png"
}
```

Agent 能推理：

```text
这是图片
不要 read_file
改用 image tool
```

---

# 编码处理

不要假设 utf8。

现实世界：

```text
utf-8
utf-8-bom
gbk
gb2312
shift-jis
utf-16
```

推荐顺序：

```python
utf-8
utf-8-sig
utf-16
gb18030
shift-jis
```

依次尝试。

成功即返回。

---

# 如果全部失败

```json
{
  "error": "UNSUPPORTED_ENCODING"
}
```

不要：

```python
errors="ignore"
```

否则代码会被读坏。

---

# 安全边界

和 list_dir 一样：

```python
realpath(path)
```

检查：

```python
startswith(workspace_root)
```

防止：

```text
../../../../etc/passwd
```

---

# 符号链接

一定检查。

例如：

```text
project/
 └─ secret -> /etc
```

用户：

```text
read_file(secret/passwd)
```

如果只检查路径字符串：

```python
path.startswith(workspace_root)
```

就被绕过了。

必须：

```python
resolved = os.path.realpath(path)
```

检查 resolved。

---

# 要不要禁止 .env

我的建议：

不要在工具层禁止。

因为：

```text
.env.example
.env.local
.env.dev
```

很多是正常开发文件。

更好的做法：

工具返回。

Agent 层过滤。

例如：

```json
{
  "content": "...",
  "sensitive": true
}
```

检测：

```text
AWS_SECRET_ACCESS_KEY
OPENAI_API_KEY
DATABASE_URL
```

标记：

```json
{
  "contains_secrets": true
}
```

让上层 Agent 决定是否展示。

---

# Gitignore 文件怎么办

很多 Agent 会直接读：

```text
node_modules
dist
build
```

浪费大量 token。

推荐：

```json
{
  "respect_gitignore": true
}
```

默认开启。

---

# 最终版 read_file

我会设计成：

```json
{
  "path": "src/main.py",
  "start_line": 1,
  "max_lines": 500
}
```

返回：

```json
{
  "path": "src/main.py",
  "encoding": "utf-8",
  "mime_type": "text/x-python",
  "total_lines": 2380,
  "start_line": 1,
  "end_line": 500,
  "truncated": true,
  "contains_secrets": false,
  "content": "1 | import os\n2 | import json\n..."
}
```

这是接近 Claude Code / Codex CLI 这一代 Agent 的设计。

再往前一步的话，我甚至会把 `read_file` 拆成两个工具：

```text
get_file_info(path)
read_file(path,start_line,max_lines)
```

因为 Agent 经常先看：

```text
大小
类型
编码
总行数
```

然后决定怎么读。

这样在大型仓库上的表现会明显更稳定。
