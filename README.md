# dsh-personalization

[English](./README_EN.md) | 简体中文

dsh 个性化插件：在 dsh 设置里教 AI「你是谁、它是谁、要记住什么」。一次配置，之后**所有任务、所有回复**都生效。

## 功能

- dsh 设置新增**「个性化」**页（位于「Agent 预设」下方），跟随界面语言（中文 / English）
- **自定义指令**：给 AI 定几条长期规则（例如「先给结论再展开」），后续所有任务都生效
- **称呼与身份**：AI 对你的称呼、AI 自己的名字
- **AI 的人设 / 人格描述**：角色设定与说话风格
- **总开关**：一键停用所有注入，不必逐项清空
- **保存即生效**：设置保存后，从下一条消息起就按新内容注入，无需重启 `dsh web`
- 注入内容紧随 dsh 内置人设之后、工具说明之前；逐行加引用标记，避免用户内容伪造系统指令
- 所有配置只保存在本机 `~/.dsh/personalization.json`，不上传任何服务器

## 界面截图

![个性化设置页（中文）](assets/settings-zh.png)

英文界面：

![个性化设置页（English）](assets/settings-en.png)

## 安装

请显式指定版本号安装（当前最新 **v1.0.0**）：

```bash
dsh plugin --profile web add dsh-personalization@1.0.0
```

> 请务必带上 `@1.0.0` 版本号，确保安装到该最新版本；仅写包名会装到 `latest`，无法保证是 1.0.0。

重启 `dsh web` 生效。

## 卸载

```bash
dsh plugin --profile web rm dsh-personalization
```

## 配置文件

所有内容保存在本机 `~/.dsh/personalization.json`，可直接手改（保存后无需重启，下一轮对话自动读取）：

```json
{
  "enabled": true,
  "nickname": "阿伟",
  "aiName": "小深",
  "instructions": "回答先给结论再展开。\n代码注释和提交信息用中文。",
  "persona": "严谨但不失幽默的资深工程师。"
}
```

| 字段 | 含义 | 上限（字符） |
| --- | --- | --- |
| `enabled` | 总开关，`false` 时完全不注入 | — |
| `nickname` | AI 对你的称呼 | 80 |
| `aiName` | AI 自己的名字 | 80 |
| `instructions` | 自定义指令（长期规则） | 1500 |
| `persona` | 人设 / 人格描述 | 2000 |

## 工作原理

插件分两半：

- **宿主半区**（`lib/index.js`，Node）：向 dsh 的系统提示词注册表注册一个 `personalization:user` 段（order 1，紧跟内置人设）。该段在**每一轮对话组装时**实时读取配置文件，因此保存即生效；同时提供 `/personalization-config`（读）与 `/personalization-config-save`（写）两个同源 HTTP 接口。
- **界面半区**（`lib/client.js`，浏览器）：向设置页 `settings.section` 插槽注册「个性化」页（order 25），通过上面的 HTTP 接口读写配置，跟随 dsh 界面语言。

全空或总开关关闭时输出空串，dsh 会自动丢弃该段，提示词零冗余。

## 联系

问题或建议，欢迎联系：

- 邮箱：crazy_l118@icloud.com
- GitHub Issues：[提交 issue](https://github.com/crazy-L118/dsh-personalization/issues)

## 赞助

如果这个插件对你有帮助，可以给我的晚餐加一根火腿肠 🌭

![赞赏码](assets/sponsor.jpg)

## 免责声明

- 本项目与 DeepSeek **无隶属、背书或赞助关系**。
- "DeepSeek Harness" 是 DeepSeek 的注册商标，此处仅作描述性引用；插件名采用官方推荐的 DSH 缩写。
- 个性化内容仅注入到你本机 dsh 发起的模型请求中，不会发送给任何第三方。

## License

MIT
