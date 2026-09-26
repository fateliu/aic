# 漫想工坊

文字、图片创意、漫画分格与动画分镜的创作工作台。提示词子 Agent 先补全细节，用户检查后再由主创 Agent 组织作品。原项目名为“一页创作”，旧版活动项目仍可打开、编辑和导出。

当前是创作前期原型：能输出文字、精细提示词与脚本。**没有接入图像或视频渲染，不会将脚本冒充已经生成的图片、漫画或动画。**

## 启动

需要 Node.js 22+，无需安装第三方依赖。在项目目录运行：

```powershell
npm start
```

打开 http://127.0.0.1:3000 。无需密钥即可用规则演示：选择类型 → 填入示例 → 优化提示词 → 检查/修改并确认提示词 → 主 Agent 创作 → 确认草稿 → 导出 TXT / JSON。

## 连接 DeepSeek

1. 在 DeepSeek 开放平台准备 API Key。聊天网站账号或会员不等于已开通 API。
2. 如果还没有 `.env`，复制 `.env.example` 为 `.env`。
3. 只在本机 `.env` 填写 `DEEPSEEK_API_KEY`，不要在聊天、前端源码或 GitHub 中填写密钥。
4. 保留默认官方地址，按账户可用模型设置 `DEEPSEEK_MODEL`，然后重启 `npm start`。

```dotenv
DEEPSEEK_API_KEY=在本机填写你的密钥
DEEPSEEK_MODEL=deepseek-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

默认模型名依据开发时官方示例，模型可用性以账户为准。密钥仅由后端读取；配置接口只返回是否已配置。模型模式按你的账户计费，规则演示不调用模型。一次提示词优化最多 2 次模型请求，一次主创最多 6 轮，每阶段整体超时 120 秒；失败不会自动切换成模板或无限重试。

接口参考：[DeepSeek JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/) 与 [Tool Calls](https://api-docs.deepseek.com/zh-cn/guides/tool_calls/)。当前使用非流式、非思考模式；主 Agent 支持 tool_call_id 的工具结果回传。

也可在 `.env` 配置 `OLLAMA_MODEL`、`OLLAMA_BASE_URL`，使用支持工具调用的本地模型。

## 主 Agent 与子 Agent

提示词子 Agent 使用独立上下文和 JSON 输出，整理完整提示词、角色锚点、限制条件、补充建议及待确认问题。它没有执行工具或访问其他项目的权限。用户可以在界面编辑后保存。

主创 Agent 只接收当前项目、确认后的提示词和所选 Skill。它通过 `save_creative`、`review_creative` 提交和检查草稿。文字模式输出正文与一个提纲单元；图片模式输出一个图像提示词；漫画模式输出四格；动画模式输出三个五秒镜头。

程序检查字段、数量及长度，不能替代语义审核。修改提示词会清空旧草稿并撤销确认；修改草稿会撤销作品确认；版本号避免误操作过期内容。规则演示只模拟这些阶段，不具备模型推理能力。

## 创作 Skill 扩展

内置漫画角色与分格、动画镜头设计、画面构图三个指令包。漫画包参考 MIT 开源的 baoyu-comic，保留来源和许可，是本项目适配版，不是完整上游插件。

添加方法见 [Skill 来源与扩展](creative-skills/SOURCES.md)。将自包含的 `SKILL.md` 放入 `creative-skills/` 并在 `registry.json` 注册，刷新页面后可选择。只读取白名单 Markdown，不自动下载、执行脚本或安装依赖。每个项目保留所用 Skill 内容及 SHA256 快照。

## 动漫背景

点击页面右上角“背景设置”，可选择本机图片临时预览并调整可见度，不上传文件。

永久配置：将有权使用的图片放到 `public/assets/background.webp`，把 `public/theme.json` 的 `backgroundImage` 改为 `/assets/background.webp`，刷新即可。支持 PNG、JPEG、WebP、AVIF，透明度可设为 0～0.65。详见 [背景配置](public/assets/README.md)。

## 媒体服务扩展接口

确认草稿后，可导出媒体任务说明。`POST /api/projects/:id/media-request` 返回 `not_connected` 和规范化请求：项目版本、类型、画幅、角色锚点、限制条件及逐格/逐镜头提示词。**它目前不会提交真实生成任务或收费。**

后续图片/视频适配器可消费这个结构；正式接入时还需实现报价确认、任务持久化、幂等提交、轮询、素材存储与失败恢复。DeepSeek 在本项目中负责文字和规划，图像/视频服务另接。

## 验证与运行边界

```powershell
npm test
```

12 项自动测试覆盖旧流程、新类型、子 Agent 输出校验、DeepSeek 模拟请求及工具消息、Skill 白名单、确认门禁、版本失效与媒体说明接口。浏览器验证了四格漫画流程、保存找回、背景预览及手机布局。**没有使用真实 API Key 联调 DeepSeek；真实输出质量和账户连通性待配置后验证。**

数据保存在忽略 Git 的 `data/`，`.env` 同样忽略。`PORT` 和 `DATA_DIR` 可修改。服务仅监听 `127.0.0.1`，面向单机单进程，没有登录、多人权限或任务队列，不适合直接开放公网。

目录：`lib/studio.mjs` 主子 Agent；`lib/providers.mjs` 模型适配；`lib/skills.mjs` Skill 加载；`server.mjs` API；`public/` 界面；`creative-skills/` 扩展包；`test/` 测试。

架构和后续开发范围见 [原型方案](docs/agent-prototype.md)。
