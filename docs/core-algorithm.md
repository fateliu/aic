# 核心算法与 Agent 编排说明

## 贡献范围

本项目使用现成文本与图像模型，工程贡献在于创作任务分解、可检查的中间结果、Skill 固定快照、人工版本确认和异步媒体恢复。没有训练自有基础模型，也不把第三方模型能力表述为自研算法。角色一致性与提示词可用性尚需对照实验验证。

## 1. 提示词子 Agent

输入：原始想法、类型、风格、画幅和最多三个 Skill。独立 system prompt 要求保留用户明确设定，把新增创意写入 assumptions，把重要缺失信息写入 questions。

输出 JSON：refinedPrompt、characterAnchor、negativePrompt、assumptions、questions。程序校验字段、长度、数组数量；最多两次模型请求，整个阶段限时 120 秒。用户可编辑所有关键设定，检查后进入主创阶段。

设计意图是让新增设定变得可见、可修改；它不保证模型绝不添加未经确认的内容，需要人检查完整提示词。

## 2. 有界主创 Agent

主创接收原始 brief、当前 refinement 与项目创建时的 Skill 快照。仅提供两个工具：

- `save_creative`：写入标题、正文/故事梗概和 shots；强制单元数量为文字 1、图片 1、漫画 4、动画 3。
- `review_creative`：验证已存草稿的字段、数量与长度；失败结果回传给模型修正。

每阶段最多六轮，每轮最多四次工具调用，总超时 120 秒。只有成功保存并检查的草稿可以返回。每次重新保存都会清除旧检查标记。工具结果使用供应商要求的 tool_call_id 关联。这个检查是结构校验，不是独立视觉评审或语义评分。

```text
for round in 1..6:
    response = model(messages, allowed_tools)
    for call in response.tool_calls (最多4个):
        if save_creative: 校验并暂存，reviewed = false
        if review_creative: 校验暂存结果，reviewed = true
        返回工具结果到上下文
    if creative存在 and reviewed: 返回草稿待人审
超过边界: 明确失败，保留项目便于重试
```

## 3. Skill 与版本一致性

指令包来自本地注册白名单，限制单包长度并按类型筛选。项目保存内容和 SHA256；后续修改磁盘上的 Skill 不会静默改变已有项目的创作上下文。来源和许可可追溯，不自动运行外部代码。

revision 是创作内容版本。编辑提示词使旧草稿与确认失效；编辑草稿使作品确认失效。图片任务记录创建时的 revision，只有当前版本的成功图片进入当前四格成品。人工确认不涉及模型推理，却防止了“旧稿确认、新稿执行”的交互错误。

## 4. 绘图与角色参考

每个画面的实际输入由风格、该格 visual、固定角色特征和限制条件组成。服务端限制到 5000 字符，画幅映射为 1280×720、720×1280、1024×1024。对白独立保存，不让生成器把文本写进画面。

单图或漫画可选择用户上传的角色 JPEG；漫画也可选当前版本成功生成的本地 PNG。两种来源互斥，服务端读取后临时编码为 base64 交给万相，同时要求外貌、发型、服装等身份细节优先参考图片，场景和动作遵循文字。参考图二进制不写入项目 JSON，仅保存 referenceUploadId / referenceName 或 referenceJobId。上传素材独立于草稿版本，不自动修改已有图片任务；每次生图显式记录选择。这是图像条件传递，非模型微调或确定性身份锁定。接口详见 [角色参考图](reference-images.md)。

供应商调用使用原生异步接口、`n=1`，返回 task_id 后轮询。结果 PNG 下载到本地，浏览器将四格等比放入 2×2 画布。合成阶段不调用模型、没有额外 API 费用，也不自动生成文字气泡。

## 5. 提交幂等与故障恢复

| 状态/条件 | 行为 |
| --- | --- |
| 尚未确认当前版本或费用 | 不发送生图请求 |
| 已存在相同版本、相同画面的任务 | 返回已有任务 |
| 明确重新生成 | 需要当前旧任务 ID，记录 replaces；重复的替换请求复用新任务 |
| 提交前 | 先持久化 SUBMITTING，再调用远程 API |
| 提交断网/响应不确定 | 标记 SUBMIT_UNKNOWN，不自动重新提交 |
| 进程在提交中断 | 刷新发现没有 task_id，转为未知状态等待核对 |
| 已收到 task_id | 查询原任务，不创建新任务 |
| 图片下载失败 | 保存原 sourceUrl，重试下载，不重新绘图 |
| 未知任务找回 | 用户提供 task_id，查询并保存已有结果 |

项目锁避免同进程并发提交，JSON 原子替换减少半写文件风险。远程服务没有本项目可用的跨系统事务：极端断网窗口不能保证“恰好一次成功”，因此宁可保留未知状态，也不盲目重试扣费。当前实现仅适用于单实例。

## 6. 实现索引与依据

主要实现：`lib/studio.mjs`、`lib/skills.mjs`、`lib/providers.mjs`、`lib/images.mjs`、`server.mjs`、`public/images.js`。测试使用依赖注入模拟提供方，并另有真实单图联调。

依据：[DeepSeek JSON](https://api-docs.deepseek.com/zh-cn/guides/json_mode/)、[Tool Calls](https://api-docs.deepseek.com/zh-cn/guides/tool_calls/)、[万相图像 API](https://help.aliyun.com/zh/model-studio/wan-image-generation-and-editing-api-reference)、[Skill 来源与授权](../creative-skills/SOURCES.md)。
