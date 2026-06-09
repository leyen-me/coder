我看了那份方案，整体是对的，但如果你的目标是做一个**生产级 Code Agent（对标 Claude Code / Codex / Cursor Agent）**，还有一些关键点没提到，或者优先级放错了。

我会把它整理成一个「最终版 write_file 设计清单」。

---

# 我的总体结论

我不建议最终只做一个：

```text
write_file(path, content)
```

而是：

```text
write_file      # 创建文件
replace_file    # 整文件覆盖
edit_file       # 局部修改（核心）
```

其中：

```text
read_file + edit_file
```

会占 Agent 80% 以上的调用。

---

# 第一层：路径安全

必须做。

### 1. Workspace Boundary

用户：

```text
../../../etc/passwd
```

Agent：

```text
../../.ssh/id_rsa
```

统一：

```python
resolved = realpath(...)
```

检查：

```python
resolved.startswith(workspace_root)
```

否则拒绝。

---

### 2. Symlink Escape

例如：

```text
project/
 └── secret -> /etc
```

用户：

```text
secret/passwd
```

如果只检查字符串：

```python
path.startswith(workspace_root)
```

会被绕过。

必须检查：

```python
realpath()
```

后的结果。

---

# 第二层：文件类型安全

## 禁止写二进制

第一版 Agent 不应该支持：

```text
png
jpg
mp4
sqlite
pdf
zip
```

只支持：

```text
text/*
application/json
application/xml
```

否则：

```text
Agent 修改图片
Agent 修改 sqlite
```

几乎必炸。

---

## 文件大小限制

例如：

```python
MAX_WRITE_SIZE = 1MB
```

防止：

```text
生成一个 500MB 文件
```

直接把上下文或者磁盘打爆。

---

# 第三层：覆盖保护

这是最重要的一层。

---

## write_file

仅允许：

```text
文件不存在
```

例如：

```json
{
  "path": "src/foo.ts",
  "content": "..."
}
```

如果已存在：

```json
{
  "error": "FILE_ALREADY_EXISTS"
}
```

---

## replace_file

明确表示：

```text
我要覆盖整个文件
```

---

### Hash Guard

读文件：

```json
{
  "sha256": "abc123"
}
```

写文件：

```json
{
  "path": "src/foo.ts",
  "expected_sha256": "abc123",
  "content": "..."
}
```

如果文件被修改：

```json
{
  "error": "FILE_CHANGED"
}
```

避免：

```text
Agent A
Agent B

互相覆盖
```

---

# 第四层：原子写入

这个非常重要。

不要：

```python
open(file, "w")
write(...)
```

因为：

```text
写到一半进程崩溃
```

文件废了。

---

正确：

```text
foo.ts.tmp
↓
写完
↓
fsync
↓
rename
↓
foo.ts
```

Linux/macOS 上：

```python
rename()
```

基本是原子的。

---

# 第五层：保留文件属性

很多 Agent 忽略。

---

## 保留编码

读到：

```text
utf-8
utf-16
shift-jis
gb18030
```

写回必须保持。

否则：

```text
整个仓库乱码
```

---

## 保留换行符

原文件：

```text
CRLF
```

写回：

```text
LF
```

会出现：

```git
500 lines changed
```

其实只改了一行。

---

## 保留执行权限

例如：

```text
scripts/build.sh
```

原来：

```bash
chmod +x
```

Agent 覆盖后：

```text
不可执行
```

CI 直接挂。

---

# 第六层：备份和回滚

推荐。

修改前：

```text
.history/
```

保存：

```text
foo.ts.before
```

或者：

```text
foo.ts.bak
```

---

返回：

```json
{
  "backup_path": ".history/foo.ts.001"
}
```

Agent 可以：

```text
undo
```

---

# 第七层：敏感文件保护

这里我和很多 Agent 的设计不同。

---

不要硬编码：

```text
.env
```

直接拒绝。

因为：

```text
.env.example
.env.development
```

经常需要修改。

---

建议：

维护风险等级。

### High Risk

```text
.env
.env.*
id_rsa
id_ed25519
*.pem
*.p12
.kube/config
```

写入时：

```json
{
  "warning": "SENSITIVE_FILE"
}
```

需要 Agent 显式确认。

---

# 第八层：返回 Diff

这是别人方案里没提到的。

其实非常重要。

---

不要：

```json
{
  "success": true
}
```

---

返回：

```json
{
  "action": "modified",
  "lines_added": 12,
  "lines_removed": 3
}
```

甚至：

```json
{
  "diff": "@@ -1,3 +1,4 @@ ..."
}
```

Agent 可以立刻验证：

```text
改的是不是我想改的
```

---

# 第九层：不要让 write_file 成为主要编辑工具

这是最大的架构建议。

很多人做：

```text
read_file
write_file
```

然后结束。

结果 Agent：

```text
读 300 行
重写 3000 行
```

天天出事故。

---

更好的设计：

```text
list_dir
get_file_info

read_file

write_file      # create only
replace_file    # full replace

edit_file       # search-replace
```

其中：

```json
{
  "path": "src/foo.ts",
  "old_string": "const a = 1",
  "new_string": "const a = 2"
}
```

是主力。

---

# 如果我是 Claude Code 团队

最终 Schema 会长这样：

```json
{
  "path": "src/foo.ts",
  "content": "...",

  "mode": "create|replace",

  "expected_sha256": "...",

  "create_parent_dirs": true,

  "preserve_encoding": true,
  "preserve_newline": true,
  "preserve_permissions": true,

  "create_backup": true
}
```

返回：

```json
{
  "success": true,

  "path": "src/foo.ts",

  "action": "created|replaced",

  "sha256": "...",

  "bytes_written": 8123,

  "lines_added": 18,
  "lines_removed": 7,

  "backup_path": ".history/foo.ts.001"
}
```

而真正高频使用的工具会是：

```text
edit_file(
  path,
  old_string,
  new_string
)
```

`write_file` 主要负责创建文件和少量整文件生成，`edit_file` 才是让 Code Agent 在大型代码库里稳定工作的核心。
