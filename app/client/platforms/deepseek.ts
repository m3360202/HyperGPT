import {
  ApiPath,
  DEFAULT_API_HOST,
  DeepSeek,
  REQUEST_TIMEOUT_MS,
} from "@/app/constant";
import { useAppConfig, useChatSettings, useChatStore } from "@/app/store";

import { ChatOptions, LLMApi, LLMModel, LLMUsage } from "../api";
import Locale from "../../locales";
import {
  EventStreamContentType,
  fetchEventSource,
} from "@fortaine/fetch-event-source";
import { prettyObject } from "@/app/utils/format";
import { getClientConfig } from "@/app/config/client";
import { SignJWT } from "jose";

export interface ChatGLMListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export interface ChatGrokListModelResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    root: string;
  }>;
}

export async function generateToken(
  apikey: string,
  expSeconds: number,
): Promise<string> {
  let [id, secret] = apikey.split(".");
  if (!id || !secret) {
    throw new Error("invalid apikey");
  }

  const payload = {
    api_key: id,
    exp: Math.round(Date.now() / 1000) + expSeconds,
    timestamp: Math.round(Date.now() / 1000),
  };

  // const secretJWK = await parseJwk({ kty: 'oct', k: secret, alg: 'HS256' }, 'HS256')
  const secretJWK = new TextEncoder().encode(secret);

  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", sign_type: "SIGN" })
    .sign(secretJWK);
}

export class DeepSeekApi implements LLMApi {
  private disableListModels = true;

  path(path: string): string {
    let baseUrl = "/api/deepseek/";

    if (baseUrl.length === 0) {
      const isApp = !!getClientConfig()?.isApp;
      baseUrl = isApp ? DEFAULT_API_HOST : ApiPath.ChatGLM;
    }

    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, baseUrl.length - 1);
    }
    if (!baseUrl.startsWith("http") && !baseUrl.startsWith(ApiPath.ChatGLM)) {
      baseUrl = "https://" + baseUrl;
    }

    return [baseUrl, path].join("/");
  }

  extractMessage(res: any) {
    const choice = res.choices?.at(0);
    if (!choice) {
      return "";
    }

    const content = choice.message?.content || "";
    const reasoningContent = choice.message?.reasoning_content || "";

    // 如果有推理内容，使用 Markdown 格式显示
    if (reasoningContent) {
      const reasoningMarkdown = `> *🤔 深度思考中...*\n> \n> ${reasoningContent.replace(/\n/g, "\n> ")}\n\n`;
      return reasoningMarkdown + content;
    }

    return content;
  }

  getMessagesContext(messages: any[]) {
    let arr: object[] = [];
    messages.map((v) => {
      if (v && v.img && v.img.length > 0) {
        arr.push({
          role: v.role,
          content: [
            {
              type: "text",
              text: v.content,
            },
            {
              type: "image_url",
              image_url: {
                url: v.img,
              },
            },
          ],
        });
      } else {
        arr.push({
          role: v.role,
          content: v.content,
        });
      }
    });
    return arr;
  }

  async chat(options: ChatOptions) {
    let messages = this.getMessagesContext(options.messages);
    const useReasoner = useChatSettings.getState().useReasoner;
    const modelConfig = {
      ...useAppConfig.getState().modelConfig,
      ...useChatStore.getState().currentSession().mask.modelConfig,
      ...{
        model: options.config.model,
      },
    };
    const getModel = (model: string, reasoner: boolean) => {
      if (model === "deepseek" && reasoner) {
        return "deepseek-reasoner";
      } else if (model === "deepseek" && !reasoner) {
        return "deepseek-chat";
      } else {
        return model;
      }
    };

    const requestPayload = {
      messages: messages,
      stream: options.config.stream,
      model: getModel(modelConfig.model, useReasoner),
      temperature: modelConfig.temperature,
      // presence_penalty: modelConfig.presence_penalty,
      // frequency_penalty: modelConfig.frequency_penalty,
      top_p: modelConfig.top_p === 1 ? 0.5 : modelConfig.top_p,
      // max_tokens: Math.max(modelConfig.max_tokens, 1024),
      // Please do not ask me why not send max_tokens, no reason, this param is just shit, I dont want to explain anymore.
    };

    //console.log("[Request] chatglm payload: ", requestPayload);

    const shouldStream = !!options.config.stream;
    const controller = new AbortController();
    options.onController?.(controller);
    try {
      const chatPath = "https://api.deepseek.com/chat/completions";
      const Token = process.env.NEXT_PUBLIC_DEEPSEEK_KEY;
      const chatPayload = {
        method: "POST",
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + Token,
          "Content-Type": "application/json",
          "x-requested-with": "XMLHttpRequest",
        },
      };

      // make a fetch request
      const requestTimeoutId = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      if (shouldStream) {
        let responseText = "";
        let remainText = "";
        let finished = false;
        let reasoningStarted = false; // 跟踪推理内容是否已经开始
        let reasoningEnded = false; // 跟踪推理内容是否已经结束

        // animate response to make it looks smooth
        function animateResponseText() {
          if (finished || controller.signal.aborted) {
            responseText += remainText;
            console.log("[Response Animation] finished");
            return;
          }

          if (remainText.length > 0) {
            const fetchCount = Math.max(1, Math.round(remainText.length / 60));
            const fetchText = remainText.slice(0, fetchCount);
            responseText += fetchText;
            remainText = remainText.slice(fetchCount);
            options.onUpdate?.(responseText, fetchText);
          }

          requestAnimationFrame(animateResponseText);
        }

        // start animaion
        animateResponseText();

        const finish = () => {
          if (!finished) {
            // 如果推理内容开始了但没有结束，需要添加结束标记
            if (reasoningStarted && !reasoningEnded) {
              remainText += "\n\n";
            }
            finished = true;
            options.onFinish(responseText + remainText);
          }
        };

        controller.signal.onabort = finish;
        console.log("chatPath------", chatPath, chatPayload);
        //@ts-ignore
        fetchEventSource(chatPath, {
          ...chatPayload,
          async onopen(res) {
            clearTimeout(requestTimeoutId);
            const contentType = res.headers.get("content-type");
            console.log(
              "[ChatGLM] request response content type: ",
              contentType,
            );

            if (contentType?.startsWith("text/plain")) {
              responseText = await res.clone().text();
              return finish();
            }

            if (
              !res.ok ||
              !res.headers
                .get("content-type")
                ?.startsWith(EventStreamContentType) ||
              res.status !== 200
            ) {
              const responseTexts = [responseText];
              let extraInfo = await res.clone().text();
              try {
                const resJson = await res.clone().json();
                extraInfo = prettyObject(resJson);
              } catch {}

              if (res.status === 401) {
                responseTexts.push(Locale.Error.Unauthorized);
              }

              if (extraInfo) {
                responseTexts.push(extraInfo);
              }

              responseText = responseTexts.join("\n\n");

              return finish();
            }
          },
          onmessage(msg) {
            if (msg.data === "[DONE]" || finished) {
              return finish();
            }
            const text = msg.data;
            try {
              const json = JSON.parse(text) as {
                choices: Array<{
                  delta: {
                    reasoning_content: string;
                    content: string;
                  };
                }>;
              };

              const delta = json.choices[0]?.delta;
              if (delta) {
                // 处理推理内容
                if (delta.reasoning_content) {
                  // 如果是第一次收到推理内容，添加 Markdown 推理过程的开始标记
                  if (!reasoningStarted) {
                    remainText += `> *🤔 深度思考中...*\n> \n> `;
                    reasoningStarted = true;
                  }
                  remainText += delta.reasoning_content.replace(/\n/g, "\n> ");
                }

                // 处理主要内容
                if (delta.content) {
                  // 如果之前有推理内容但还没有结束，先添加结束标记
                  if (reasoningStarted && !reasoningEnded) {
                    remainText += "\n\n";
                    reasoningEnded = true;
                  }
                  remainText += delta.content;
                }
              }
            } catch (e) {
              console.error("[Request] parse error", text);
            }
          },
          onclose() {
            finish();
          },
          onerror(e) {
            options.onError?.(e);
            throw e;
          },
          openWhenHidden: true,
        });
      } else {
        const res = await fetch(chatPath, chatPayload);
        clearTimeout(requestTimeoutId);

        const resJson = await res.json();
        const message = this.extractMessage(resJson);
        options.onFinish(message);
      }
    } catch (e) {
      console.log("[Request] failed to make a chat request", e);
      options.onError?.(e as Error);
    }
  }
  async usage() {
    return {
      used: 0,
      total: 1000000000,
    } as LLMUsage;
  }

  async models(): Promise<LLMModel[]> {
    return [
      {
        name: "deepseek",
        available: true,
        provider: {
          id: "deepseek",
          providerName: "DeepSeek",
          providerType: "deepseek",
        },
      },
    ];
  }
}
export { DeepSeek };
