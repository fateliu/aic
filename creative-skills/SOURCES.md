# Skill 来源与扩展

漫画适配包参考 [JimLiu/baoyu-skills 的 baoyu-comic](https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-comic)，2026-09-26 查看，页面显示版本 1.117.4，上游许可为 [MIT](https://github.com/JimLiu/baoyu-skills/blob/main/LICENSE)。本地是经过删减的文字指令适配版，不是完整插件，也不运行上游脚本。上游许可保留在 comic-continuity/LICENSE。

增加扩展时，将审阅过的 SKILL.md 放入独立目录，在 registry.json 中注册 id、name、description、kinds、path、source、license 和 enabled。`kinds` 可选 text、image、comic、animation。重启不是必需的，刷新页面即可读到新注册项。

应用只按白名单读取本地 Markdown，不下载链接、不执行代码、不展开 references 或 scripts。一次最多三个包，每包最多 6000 字符。模型收到的是参考资料；系统工具权限不随 Skill 变化。项目保存所用内容快照及 SHA256，便于复现。外部包需先确认授权并适配成自包含的创作指令，不能把原版 Skill 丢进来就期望运行全部能力。
