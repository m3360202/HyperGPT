<div align="center">
<img src="http://papergpt.xinquji.com/assets/icon-kJavj1Pp.png" alt="预览"/>

<h1 align="center">NextChat</h1>

简单高效的 ChatGPT 网页应用，支持 GPT3, GPT4 & Glm Pro Glm4v 模型。

[演示](https://hypergpt.aliensoft.com.cn/) / [反馈 Issues](https://github.com/m3360202/HyperGPT/issues) 

</div>

## 开始使用

1. 准备好你的 [OpenAI API Key](https://platform.openai.com/account/api-keys) 或 [Glm API Key](https://open.bigmodel.cn);
### 本地开发
2. 安装 nodejs 18 和 yarn；
3. 执行 `yarn install && yarn dev` 即可。⚠️ 注意：此命令仅用于本地开发，不要用于部署！
4. 如果你想本地部署，请使用 `yarn install && yarn build && yarn start` 命令，你可以配合 pm2 来守护进程，防止被杀死，详情询问 ChatGPT。

## 开发

在开始写代码之前，需要在项目根目录新建一个 `.env.local` 文件，里面填入环境变量：

```
OPENAI_API_KEY=<your api key here>

# 中国大陆用户，可以使用本项目自带的代理进行开发，你也可以自由选择其他代理地址
BASE_URL=https://b.nextweb.fun/api/proxy
```

### `OPENAI_API_KEY` （必填项）

OpanAI 密钥，你在 openai 账户页面申请的 api key，使用英文逗号隔开多个 key，这样可以随机轮询这些 key。

### `CODE` （可选）

访问密码，可选，可以使用逗号隔开多个密码。

**警告**：如果不填写此项，则任何人都可以直接使用你部署后的网站，可能会导致你的 token 被急速消耗完毕，建议填写此选项。

### `BASE_URL` （可选）

> Default: `https://api.openai.com`

> Examples: `http://your-openai-proxy.com`

OpenAI 接口代理 URL，如果你手动配置了 openai 接口代理，请填写此选项。

> 如果遇到 ssl 证书问题，请将 `BASE_URL` 的协议设置为 http。

### `OPENAI_ORG_ID` （可选）

指定 OpenAI 中的组织 ID。

### `AZURE_URL` （可选）

> 形如：https://{azure-resource-url}/openai/deployments/{deploy-name}

Azure 部署地址。

### `AZURE_API_KEY` （可选）

Azure 密钥。

### `AZURE_API_VERSION` （可选）

Azure Api 版本，你可以在这里找到：[Azure 文档](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference#chat-completions)。

### `GOOGLE_API_KEY` (optional)

Google Gemini Pro 密钥.

### `GOOGLE_URL` (optional)

Google Gemini Pro Api Url.

### `HIDE_USER_API_KEY` （可选）

如果你不想让用户自行填入 API Key，将此环境变量设置为 1 即可。

### `DISABLE_GPT4` （可选）

如果你不想让用户使用 GPT-4，将此环境变量设置为 1 即可。

### `ENABLE_BALANCE_QUERY` （可选）

如果你想启用余额查询功能，将此环境变量设置为 1 即可。

### `DISABLE_FAST_LINK` （可选）

如果你想禁用从链接解析预制设置，将此环境变量设置为 1 即可。

### `CUSTOM_MODELS` （可选）

> 示例：`+qwen-7b-chat,+glm-6b,-gpt-3.5-turbo,gpt-4-1106-preview=gpt-4-turbo` 表示增加 `qwen-7b-chat` 和 `glm-6b` 到模型列表，而从列表中删除 `gpt-3.5-turbo`，并将 `gpt-4-1106-preview` 模型名字展示为 `gpt-4-turbo`。
> 如果你想先禁用所有模型，再启用指定模型，可以使用 `-all,+gpt-3.5-turbo`，则表示仅启用 `gpt-3.5-turbo`

用来控制模型列表，使用 `+` 增加一个模型，使用 `-` 来隐藏一个模型，使用 `模型名=展示名` 来自定义模型的展示名，用英文逗号隔开。


## 开源协议

[MIT](https://opensource.org/license/mit/)
