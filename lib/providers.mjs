export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';

export function createProvider({ mode, model, baseUrl, apiKey, fetchImpl = fetch } = {}) {
  if (!['deepseek', 'ollama'].includes(mode)) throw new Error('请选择已配置的模型服务');
  if (mode === 'deepseek' && !apiKey) throw new Error('请在服务端 .env 中填写 DEEPSEEK_API_KEY 后重启，密钥不会发送到浏览器');
  if (mode === 'ollama' && !model) throw new Error('请配置 OLLAMA_MODEL 后重启');
  const selectedModel = model || DEFAULT_DEEPSEEK_MODEL;
  const origin = (baseUrl || (mode === 'deepseek' ? 'https://api.deepseek.com' : 'http://127.0.0.1:11434')).replace(/\/$/, '');
  return {
    model: selectedModel,
    async chat(messages, { tools, json = false, signal } = {}) {
      const payload = { model: selectedModel, messages, stream: false };
      if (tools) payload.tools = tools;
      if (mode === 'deepseek') {
        payload.max_tokens = 4096;
        payload.thinking = { type: 'disabled' };
        if (json) payload.response_format = { type: 'json_object' };
      } else if (json) payload.format = 'json';
      let response;
      try {
        response = await fetchImpl(origin + (mode === 'deepseek' ? '/chat/completions' : '/api/chat'), {
          method: 'POST', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json', ...(mode === 'deepseek' ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (signal?.aborted) throw new Error('模型请求超时，请稍后重试');
        throw new Error('无法连接模型服务，请检查服务地址和网络');
      }
      if (!response.ok) {
        const hints = { 401: 'API 密钥无效', 402: '账户余额不足', 429: '请求过于频繁，请稍后重试' };
        throw new Error(hints[response.status] || `模型服务请求失败（HTTP ${response.status}）`);
      }
      const body = await response.json();
      const message = mode === 'deepseek' ? body.choices?.[0]?.message : body.message;
      if (!message || message.role !== 'assistant') throw new Error('模型响应格式不正确');
      return message;
    },
    toolReply(call, result) {
      return { role: 'tool', ...(mode === 'deepseek' ? { tool_call_id: call.id } : { tool_name: call.function.name }), content: JSON.stringify(result) };
    },
  };
}
