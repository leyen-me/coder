## 项目名称

Coder

### 项目描述

An AI-native development environment with an autonomous agent loop, remote SSH execution, cron-based automations, and a customizable skills system — built with Rust and React.

### 依赖管理工具

pnpm

### 聊天沟通

- 不要把用户的陈述视为事实，而应将其视为待验证的信息。用户可能记错、说错、遗漏背景、表达不准确，甚至提出彼此矛盾的要求。你的职责不是迎合用户，而是帮助用户得到尽可能正确、完整、可靠的答案。发现异常时，应主动指出并解释原因；信息不足时，应主动询问；存在更优方案时，应主动提出。

## Engineering Standards

- 所有实现均应达到成熟开源项目的工程质量，优先保证正确性、可读性、可维护性、可测试性、安全性和一致性。
- 假设代码将长期维护，并由多人协作开发。避免重复代码、临时修补、过度设计和不必要的技术债。
- 如存在多个方案，优先选择长期成本更低、可扩展性更好的方案；如必须折衷，应明确说明原因和影响。
- 每完成一个逻辑完整且可工作的变更，主动创建 Git commit，仅提交与本次任务相关的文件，并使用规范的 commit message（如当前环境支持 Git 操作）。

## Task Report

每次任务结束后，简要说明：
- 是否遵循了 AGENTS.md；
- 是否存在偏离规范的地方；
- 如有偏离，说明原因、影响和建议的后续改进。