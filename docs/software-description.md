# 漫想工坊软件说明 v0.5

## 定位与交付

目标用户是需要社团宣传插画、原创短漫画的校园创作者。典型问题是初始提示词含糊、生成前难以检查角色设定、逐格结果与脚本分散。本软件把设定、脚本、确认版本、模型任务与图片放在一个项目中。

文字输出正文；图片输出单张插画；漫画输出四格脚本和逐格绘图，并在浏览器合成为 PNG；动画只输出三个五秒镜头的脚本。参考图功能用于传递人物外观，仍需人工检查结果。

## 安装与操作

1. 下载仓库源码，安装 Node.js 22 或更高版本。当前本机验收环境为 Windows、Node.js 24.14.1、Chrome。
2. 运行 `npm start` 或 Windows `start.cmd`，打开 `http://127.0.0.1:3000`。没有第三方运行依赖，无需 `npm install`。
3. 无密钥先用规则演示。要调用模型，复制 `.env.example` 为 `.env`，填 DeepSeek 和百炼密钥，重启。不要覆盖已有 `.env`。
4. 选择类型、填写想法、挑选 Skill。逐阶段优化提示词、人工确认、创作、人工确认。
5. 图片/漫画进入生成区：选择单格、检查费用确认、提交。每次请求一张；不会自动把四格全部提交。
6. 图片生成后下载 PNG；漫画四格齐全后合成下载。左侧项目记录可重新打开，TXT / JSON 导出包含创作稿。

背景配置可临时使用本机图片或永久修改 `public/theme.json`。Skill 扩展步骤和许可在 `creative-skills/SOURCES.md`。

顶部切换晴空/赤日主题，配色自动记忆。角色主视觉可在 theme.json 分别配置。项目内导航直接跳到提示词、草稿或图片，历史列表标出正在编辑的项目。

队友练习使用 `npm run dev:mock` 与 3100 端口：不读取密钥、不调用模型，图片统一为示例夹具，练习数据保存到 data-mock。它用于学习操作，不作为真实生成质量证据。

## 持久化与恢复

`data/<projectId>.json` 保存项目；`data/images/<projectId>/<jobId>.png` 保存生成图片；`data/references/<projectId>/<referenceId>.jpg` 保存用户上传的角色参考。复制整个 data 目录可备份。JSON 导出不包含图片二进制，也没有项目导入功能。

v0.5 支持在图片/漫画项目上传参考图，明确选择每次生图使用的角色来源。提示词默认折叠，分格显示简短摘要，可分别展开修改。输入限制、使用方法与图像发送时机见 [角色参考图说明](reference-images.md)。

图片任务收到 task_id 后可以跨网页刷新、服务重启继续查询。没有独立后台轮询进程：需要网页打开该项目或调用 refresh API 才会推进查询/下载。生成服务的临时结果链接有有效期，应及时保存；已存本地的 PNG 不依赖临时链接。

| 现象 | 处理 |
| --- | --- |
| 图片引擎等待配置 | 核对 `DASHSCOPE_API_KEY`，重启服务；DeepSeek Key 无法替代它 |
| 401 / 403 | 核对百炼北京地域密钥、工作空间与模型权限 |
| 提交结果待核对 | 到百炼控制台查看任务；将对应 task_id 填进恢复栏；不会新建任务 |
| 已生成，待保存 | 点击重试保存；只下载已有结果，不重新绘图 |
| 临时图片链接已过期 | 先在控制台核对是否还能下载；软件不自动重生成，以免额外计费 |
| 提示项目版本过期 | 重新打开项目，检查最新草稿并确认 |
| 修改画稿后无法合成 | 当前版本需要四张图；旧版图片仍可独立下载 |
| 网络反复失败 | 自动查询连续三次出错后暂停；可手动刷新 |

## 主要接口

所有写接口使用 JSON，服务只接受本机 Host；拒绝异源 Origin。ID 为本服务生成的 UUID。

| 路径 | 用途 |
| --- | --- |
| `GET /api/config` | 返回服务是否配置，不返回密钥 |
| `GET /api/skills` | 可选创作 Skill 元数据 |
| `GET /api/projects` | 项目列表 |
| `POST /api/projects` | 创建项目：brief、mode、skillIds |
| `POST /api/projects/:id/refine` | 当前 revision 的提示词细化 |
| `PATCH /api/projects/:id/refinement` | 编辑设定，清空旧草稿并增加版本 |
| `POST /api/projects/:id/generate` | 根据已检查的提示词创作草稿 |
| `PATCH /api/projects/:id/creative` | 编辑草稿，撤销作品确认 |
| `POST /api/projects/:id/approve` | 确认当前草稿版本 |
| `POST /api/projects/:id/images` | 单张生图；revision、unitIndex、confirmCost，选填 replaceJobId 及互斥的 referenceUploadId / referenceJobId |
| `POST /api/projects/:id/references` | 保存上传参考图，返回 project / reference，不提交模型 |
| `GET /api/projects/:id/references/:referenceId/file` | 同项目参考图 JPEG 预览 |
| `POST /api/projects/:id/images/:jobId/refresh` | 查询已有任务并保存结果 |
| `POST /api/projects/:id/images/:jobId/recover` | 用控制台 taskId 找回结果未知的任务 |
| `GET /api/projects/:id/images/:jobId/file` | 本地 PNG；`?download=1` 下载 |
| `GET /api/projects/:id/export?format=txt` | 确认后导出创作稿；另支持 json |
| `POST /api/projects/:id/media-request` | 只导出规范化任务说明，不提交生成 |

## 边界

当前部署方式为本机源码运行，不是公网 SaaS。没有账户、团队权限、数据库集群或多进程锁。费用确认表示同意提交单张请求，不是人民币报价或余额管理。API 费用、服务可用性按供应商账户实际情况确定。
