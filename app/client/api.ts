import { getClientConfig } from "../config/client";
import {
  ACCESS_CODE_PREFIX,
  Azure,
  ModelProvider,
  ServiceProvider,
} from "../constant";
import { ChatMessage, ModelType, useAccessStore, useChatStore } from "../store";
import { ChatGPTApi } from "./platforms/openai";
import { GeminiProApi } from "./platforms/google";
import { ChatGLMApi } from "./platforms/chatglm";
import { DeepSeekApi } from "./platforms/deepseek";
import { ChatGrokApi } from "./platforms/grok";
export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export const Models = ["gpt-3.5-turbo", "gpt-4"] as const;
export type ChatModel = ModelType;

export interface RequestMessage {
  role: MessageRole;
  content: string;
  img: string;
}

export interface LLMConfig {
  model: string;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface ChatOptions {
  messages: RequestMessage[];
  config: LLMConfig;

  onUpdate?: (message: string, chunk: string) => void;
  onFinish: (message: string) => void;
  onError?: (err: Error) => void;
  onController?: (controller: AbortController) => void;
}

export interface LLMUsage {
  used: number;
  total: number;
}

export interface LLMModel {
  name: string;
  available: boolean;
  provider: LLMModelProvider;
}

export interface LLMModelProvider {
  id: string;
  providerName: string;
  providerType: string;
}

export abstract class LLMApi {
  abstract chat(options: ChatOptions): Promise<void>;
  abstract usage(): Promise<LLMUsage>;
  abstract models(): Promise<LLMModel[]>;
}

type ProviderName = "openai" | "azure" | "claude" | "palm";

interface Model {
  name: string;
  provider: ProviderName;
  ctxlen: number;
}

interface ChatProvider {
  name: ProviderName;
  apiConfig: {
    baseUrl: string;
    apiKey: string;
    summaryModel: Model;
  };
  models: Model[];

  chat: () => void;
  usage: () => void;
}

export class ClientApi {
  public llm: LLMApi;

  constructor(provider: ModelProvider = ModelProvider.GPT) {
    console.log("🚀 ~ file: api.ts:ClientApi.constructor ~ provider", provider);

    if (provider === ModelProvider.Grok) {
      console.log("[use Grok]");
      this.llm = new ChatGrokApi();
      return;
    }

    if (provider === ModelProvider.DeepSeek) {
      console.log("[use DeepSeek]");
      this.llm = new DeepSeekApi();
      return;
    }

    if (provider === ModelProvider.GLM) {
      console.log("[use GLM]");
      this.llm = new ChatGLMApi();
      return;
    }

    if (provider === ModelProvider.GeminiPro) {
      this.llm = new GeminiProApi();
      return;
    }
    this.llm = new ChatGPTApi();
  }

  config() {}

  prompts() {}

  masks() {}

  async share(messages: ChatMessage[], avatarUrl: string | null = null) {
    const msgs = messages
      .map((m) => ({
        from: m.role === "user" ? "human" : "gpt",
        value: m.content,
      }))
      .concat([
        {
          from: "human",
          value: "Share from [HyperGpt]: https://hypergpt.aliensoft.com.cn",
        },
      ]);
    // 敬告二开开发者们，为了开源大模型的发展，请不要修改上述消息，此消息用于后续数据清洗使用
    // Please do not modify this message

    const clientConfig = getClientConfig();
    const proxyUrl = "/sharegpt";
    const rawUrl = "https://sharegpt.com/api/conversations";
    const shareUrl = clientConfig?.isApp ? rawUrl : proxyUrl;
    const res = await fetch(shareUrl, {
      body: JSON.stringify({
        avatarUrl,
        items: msgs,
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    const resJson = await res.json();
    console.log("[Share]", resJson);
    if (resJson.id) {
      return `https://shareg.pt/${resJson.id}`;
    }
  }
}

export function getHeaders() {
  const accessStore = useAccessStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-requested-with": "XMLHttpRequest",
    Accept: "application/json",
  };
  const modelConfig = useChatStore.getState().currentSession().mask.modelConfig;
  const isChatGLM = ["glm-4-plus", "glm-4v-plus", "deepseek"].includes(
    modelConfig.model,
  );
  const isGrok = modelConfig.model === "grok";
  const isGoogle = modelConfig.model === "gemini-pro";
  const isAzure = accessStore.provider === ServiceProvider.Azure;
  const authHeader = isAzure ? "api-key" : "Authorization";
  const apiKey = isGoogle
    ? accessStore.googleApiKey
    : isAzure
      ? accessStore.azureApiKey
      : accessStore.openaiApiKey;

  const makeBearer = (s: string) => `${isAzure ? "" : "Bearer "}${s.trim()}`;
  const validString = (x: string) => x && x.length > 0;

  if (isChatGLM) {
    headers[authHeader] = makeBearer(
      ACCESS_CODE_PREFIX + accessStore.accessCode,
    );
    return headers;
  }

  if (isGrok) {
    return "Bearer " + process.env.NEXT_PUBLIC_GROK_KEY;
  }

  // use user's api key first
  if (validString(apiKey)) {
    headers[authHeader] = makeBearer(apiKey);
  } else if (
    accessStore.enabledAccessControl() &&
    validString(accessStore.accessCode)
  ) {
    headers[authHeader] = makeBearer(
      ACCESS_CODE_PREFIX + accessStore.accessCode,
    );
  }

  return headers;
}
