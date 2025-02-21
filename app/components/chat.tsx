import { useDebouncedCallback } from "use-debounce";
import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  Fragment,
  use,
} from "react";

import SendWhiteIcon from "../icons/send-white.svg";
import BrainIcon from "../icons/brain.svg";
import RenameIcon from "../icons/rename.svg";
import ExportIcon from "../icons/share.svg";
import ReturnIcon from "../icons/return.svg";
import CopyIcon from "../icons/copy.svg";
import LoadingIcon from "../icons/three-dots.svg";
import MaxIcon from "../icons/max.svg";
import MinIcon from "../icons/min.svg";
import ResetIcon from "../icons/reload.svg";
import DeleteIcon from "../icons/clear.svg";
import PinIcon from "../icons/pin.svg";
import EditIcon from "../icons/rename.svg";
import ConfirmIcon from "../icons/confirm.svg";
import CancelIcon from "../icons/cancel.svg";

import BottomIcon from "../icons/bottom.svg";
import StopIcon from "../icons/pause.svg";
import {
  ChatMessage,
  SubmitKey,
  useChatSettings,
  useChatStore,
  BOT_HELLO,
  createMessage,
  useAccessStore,
  Theme,
  useAppConfig,
  DEFAULT_TOPIC,
  ModelType,

} from "../store";

import {
  copyToClipboard,
  selectOrCopy,
  autoGrowTextArea,
  useMobileScreen,
} from "../utils";

import dynamic from "next/dynamic";

import { ChatControllerPool } from "../client/controller";
import { Prompt, usePromptStore } from "../store/prompt";
import Locale from "../locales";

import { IconButton } from "./button";
import styles from "./chat.module.scss";

import {
  List,
  ListItem,
  Modal,
  Selector,
  showConfirm,
  showPrompt,
  showToast,
} from "./ui-lib";
import { useNavigate } from "react-router-dom";
import {
  CHAT_PAGE_SIZE,
  LAST_INPUT_KEY,
  Path,
  REQUEST_TIMEOUT_MS,
  UNFINISHED_INPUT,
} from "../constant";
import { Avatar } from "./emoji";
import { ContextPrompts, MaskAvatar, MaskConfig } from "./mask";
import { useMaskStore } from "../store/mask";
import { ChatCommandPrefix, useChatCommand, useCommand } from "../command";
import { prettyObject } from "../utils/format";
import { ExportMessageModal } from "./exporter";
import { getClientConfig } from "../config/client";
import { useAllModels } from "../utils/hooks";
import { uploadFile } from "../utils/upload";
import { useCurrentFile } from "../store/upload";

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

export function SessionConfigModel(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const maskStore = useMaskStore();
  const navigate = useNavigate();

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Context.Edit}
        onClose={() => props.onClose()}
        actions={[
          <IconButton
            key="reset"
            icon={<ResetIcon />}
            bordered
            text={Locale.Chat.Config.Reset}
            onClick={async () => {
              if (await showConfirm(Locale.Memory.ResetConfirm)) {
                chatStore.updateCurrentSession(
                  (session) => (session.memoryPrompt = ""),
                );
              }
            }}
          />,
          <IconButton
            key="copy"
            icon={<CopyIcon />}
            bordered
            text={Locale.Chat.Config.SaveAs}
            onClick={() => {
              navigate(Path.Masks);
              setTimeout(() => {
                maskStore.create(session.mask);
              }, 500);
            }}
          />,
        ]}
      >
        <MaskConfig
          mask={session.mask}
          updateMask={(updater) => {
            const mask = { ...session.mask };
            updater(mask);
            chatStore.updateCurrentSession((session) => (session.mask = mask));
          }}
          shouldSyncFromGlobal
          extraListItems={
            session.mask.modelConfig.sendMemory ? (
              <ListItem
                className="copyable"
                title={`${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`}
                subTitle={session.memoryPrompt || Locale.Memory.EmptyContent}
              ></ListItem>
            ) : (
              <></>
            )
          }
        ></MaskConfig>
      </Modal>
    </div>
  );
}

function PromptToast(props: {
  showToast?: boolean;
  showModal?: boolean;
  setShowModal: (_: boolean) => void;
}) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const context = session.mask.context;

  return (
    <div className={styles["prompt-toast"]} key="prompt-toast">
      {props.showToast && (
        <div
          className={styles["prompt-toast-inner"] + " clickable"}
          role="button"
          onClick={() => props.setShowModal(true)}
        >
          <BrainIcon />
          <span className={styles["prompt-toast-content"]}>
            {Locale.Context.Toast(context.length)}
          </span>
        </div>
      )}
      {props.showModal && (
        <SessionConfigModel onClose={() => props.setShowModal(false)} />
      )}
    </div>
  );
}

function useSubmitHandler() {
  const config = useAppConfig();
  const submitKey = config.submitKey;
  const isComposing = useRef(false);

  useEffect(() => {
    const onCompositionStart = () => {
      isComposing.current = true;
    };
    const onCompositionEnd = () => {
      isComposing.current = false;
    };

    window.addEventListener("compositionstart", onCompositionStart);
    window.addEventListener("compositionend", onCompositionEnd);

    return () => {
      window.removeEventListener("compositionstart", onCompositionStart);
      window.removeEventListener("compositionend", onCompositionEnd);
    };
  }, []);

  const shouldSubmit = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return false;
    if (e.key === "Enter" && (e.nativeEvent.isComposing || isComposing.current))
      return false;
    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.MetaEnter && e.metaKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.metaKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

export type RenderPompt = Pick<Prompt, "title" | "content">;

export function PromptHints(props: {
  prompts: RenderPompt[];
  onPromptSelect: (prompt: RenderPompt) => void;
}) {
  const noPrompts = props.prompts.length === 0;
  const [selectIndex, setSelectIndex] = useState(0);
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectIndex(0);
  }, [props.prompts.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (noPrompts || e.metaKey || e.altKey || e.ctrlKey) {
        return;
      }
      // arrow up / down to select prompt
      const changeIndex = (delta: number) => {
        e.stopPropagation();
        e.preventDefault();
        const nextIndex = Math.max(
          0,
          Math.min(props.prompts.length - 1, selectIndex + delta),
        );
        setSelectIndex(nextIndex);
        selectedRef.current?.scrollIntoView({
          block: "center",
        });
      };

      if (e.key === "ArrowUp") {
        changeIndex(1);
      } else if (e.key === "ArrowDown") {
        changeIndex(-1);
      } else if (e.key === "Enter") {
        const selectedPrompt = props.prompts.at(selectIndex);
        if (selectedPrompt) {
          props.onPromptSelect(selectedPrompt);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.prompts.length, selectIndex]);

  if (noPrompts) return null;
  return (
    <div className={styles["prompt-hints"]}>
      {props.prompts.map((prompt, i) => (
        <div
          ref={i === selectIndex ? selectedRef : null}
          className={
            styles["prompt-hint"] +
            ` ${i === selectIndex ? styles["prompt-hint-selected"] : ""}`
          }
          key={prompt.title + i.toString()}
          onClick={() => props.onPromptSelect(prompt)}
          onMouseEnter={() => setSelectIndex(i)}
        >
          <div className={styles["hint-title"]}>{prompt.title}</div>
          <div className={styles["hint-content"]}>{prompt.content}</div>
        </div>
      ))}
    </div>
  );
}

function ClearContextDivider() {
  const chatStore = useChatStore();

  return (
    <div
      className={styles["clear-context"]}
      onClick={() =>
        chatStore.updateCurrentSession(
          (session) => (session.clearContextIndex = undefined),
        )
      }
    >
      <div className={styles["clear-context-tips"]}>{Locale.Context.Clear}</div>
      <div className={styles["clear-context-revert-btn"]}>
        {Locale.Context.Revert}
      </div>
    </div>
  );
}

function ChatAction(props: {
  text: string;
  icon: JSX.Element;
  selected?: boolean;
  onClick: () => void;
}) {
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`${styles["chat-input-action"]} clickable`}
      onClick={() => {
        props.onClick();
      }}
      style={
        {
          width: 'max-content',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: props.selected ? '#fff' : '#1c252e',
          backgroundColor: props.selected ? 'rgb(29, 147, 171)' : '',
        }
      }
    >
      <div ref={iconRef}>
        {props.icon}
      </div>
      <div ref={textRef}>
        {props.text}
      </div>
    </div>
  );
}

function useScrollToBottom() {
  // for auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  function scrollDomToBottom() {
    const dom = scrollRef.current;
    if (dom) {
      requestAnimationFrame(() => {
        setAutoScroll(true);
        dom.scrollTo(0, dom.scrollHeight);
      });
    }
  }

  // auto scroll
  useEffect(() => {
    if (autoScroll) {
      scrollDomToBottom();
    }
  });

  return {
    scrollRef,
    autoScroll,
    setAutoScroll,
    scrollDomToBottom,
  };
}

export function ChatActions(props: {
  showPromptModal: () => void;
  scrollToBottom: () => void;
  showPromptHints: () => void;
  hitBottom: boolean;
}) {
  const config = useAppConfig();
  const navigate = useNavigate();
  const chatStore = useChatStore();
  const { useReasoner } = useChatSettings();
  const modelConfig = useChatStore.getState().currentSession().mask.modelConfig;
  const shouldCleanImg = useCurrentFile.getState().shouldCleanImg;
  const imgMaxCount = 1;
  // switch themes
  const theme = config.theme;
  function nextTheme() {
    const themes = [Theme.Auto, Theme.Light, Theme.Dark];
    const themeIndex = themes.indexOf(theme);
    const nextIndex = (themeIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    config.update((config) => (config.theme = nextTheme));
  }

  // stop all responses
  const couldStop = ChatControllerPool.hasPending();
  const stopAll = () => ChatControllerPool.stopAll();

  // switch model
  const currentModel = chatStore.currentSession().mask.modelConfig.model;
  const allModels = useAllModels();
  const models = useMemo(
    () => allModels.filter((m) => m.available),
    [allModels],
  );
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [tasks, setTasks] = React.useState<any | null>(null);
  const handleSetImg = (file: any) => {
    if (file && file[0]) {
      useCurrentFile.setState({ file: file[0] });
    }
  };

  useEffect(() => {
    // if current model is not available
    // switch to first available model
    const isUnavaliableModel = !models.some((m) => m.name === currentModel);
    if (isUnavaliableModel && models.length > 0) {
      const nextModel = models[0].name as ModelType;
      chatStore.updateCurrentSession(
        (session) => (session.mask.modelConfig.model = nextModel),
      );
      showToast(nextModel);
    }
  }, [chatStore, currentModel, models]);

  useEffect(() => {
    if (shouldCleanImg) {
      setTasks(null);
      useCurrentFile.setState({ file: null, url: "", shouldCleanImg: false });
    }
  }, [shouldCleanImg]);

  return (
    <div className={styles["chat-input-actions"]}>
      {couldStop && (
        <ChatAction
          onClick={stopAll}
          text={Locale.Chat.InputActions.Stop}
          icon={<StopIcon />}
        />
      )}
      {!props.hitBottom && (
        <ChatAction
          onClick={props.scrollToBottom}
          text={Locale.Chat.InputActions.ToBottom}
          icon={<BottomIcon />}
        />
      )}

      {props.hitBottom && (
        <ChatAction
          onClick={props.showPromptModal}
          text={Locale.Chat.InputActions.Settings}
          icon={
            <svg style={{ marginTop: '3px' }} viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
              <path d="M419.539168 950.854073l-37.358863-107.437941-47.571459-22.890336-107.306958 37.748742-115.745141-145.084353 60.70764-96.213295-11.768021-51.456952-96.404654-60.34539 41.271986-180.879604 113.130593-12.606109 32.878828-41.252543-12.985756-113.025193 167.181627-80.503499 80.30907 80.571037 52.79953 0 80.319304-80.571037 167.171394 80.503499-12.975523 112.962771 32.901341 41.314964 113.134687 12.606109 41.2331 180.879604-96.366791 60.350506-11.738345 51.451836 60.706617 96.208179L797.325397 858.275561l-107.312074-37.748742-47.542806 22.890336-37.383422 107.437941L419.539168 950.855096 419.539168 950.854073zM459.363176 894.805546l105.799628 0 31.934317-91.722004 89.517803-43.144636 91.683119 32.266891 66.025763-82.794681-51.768037-82.167395 22.096251-96.843652 82.371032-51.601238L873.496218 375.628076l-96.645131-10.747785-61.944817-77.630055 11.079336-96.505961-95.375208-45.950542-68.629054 68.797899-99.369172 0-68.635193-68.797899-95.370091 45.950542 11.079336 96.511077-61.910025 77.624938-96.645131 10.747785L127.600143 478.834646l82.33624 51.566446 22.125927 96.838535-51.861158 82.167395 66.025763 82.799798 91.680049-32.266891 89.521896 43.144636L459.363176 894.805546 459.363176 894.805546zM512.214894 681.236426c-92.651167 0-168.022785-75.396177-168.022785-168.065763 0-92.63684 75.372641-167.999249 168.022785-167.999249 92.65219 0 168.033018 75.362408 168.033018 167.999249C680.247912 605.841272 604.866061 681.236426 512.214894 681.236426L512.214894 681.236426zM512.214894 396.796188c-64.277956 0-116.570949 52.292993-116.570949 116.566856 0 64.316841 52.292993 116.644627 116.570949 116.644627 64.298422 0 116.605741-52.327786 116.605741-116.644627C628.820636 449.089182 576.512293 396.796188 512.214894 396.796188L512.214894 396.796188zM512.214894 396.796188" fill="#637381">
              </path>
            </svg>
            }
        />
      )}

      {/* <ChatAction
        onClick={props.showPromptHints}
        text={Locale.Chat.InputActions.Prompt}
        icon={<PromptIcon />}
      /> */}

      {/* <ChatAction
        onClick={() => {
          navigate(Path.Masks);
        }}
        text={Locale.Chat.InputActions.Masks}
        icon={<RoleIcon />}
      /> */}

      {/* <ChatAction
        text={Locale.Chat.InputActions.Clear}
        icon={<BreakIcon />}
        onClick={() => {
          chatStore.updateCurrentSession((session) => {
            if (session.clearContextIndex === session.messages.length) {
              session.clearContextIndex = undefined;
            } else {
              session.clearContextIndex = session.messages.length;
              session.memoryPrompt = ""; // will clear memory
            }
          });
        }}
      /> */}

      <ChatAction
        onClick={() => setShowModelSelector(true)}
        text={currentModel}
        icon={
          <svg style={{ marginTop: '3px' }} viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
            <path d="M558.09543 0a461.914983 461.914983 0 0 1 462.112523 461.914983 550.610561 550.610561 0 0 1-119.775246 344.576067 34.240312 34.240312 0 1 1-50.702001-46.092729 484.50042 484.50042 0 0 0 102.062469-298.549185 393.500205 393.500205 0 0 0-787.00041 0 34.240312 34.240312 0 0 1-4.543426 16.988463q-28.248258 49.450913-85.074007 143.480078l-2.568023 3.687418 105.947428 17.976164a34.240312 34.240312 0 0 1 28.379951 30.882128l23.375598 280.573021 10.733021-0.790161 158.624832-12.247496a34.240312 34.240312 0 1 1 5.26774 68.217238l-169.292006 13.169351a68.414778 68.414778 0 0 1-73.419131-62.48857l-21.202655-254.168473-79.74042-13.498585a68.414778 68.414778 0 0 1-56.694056-73.814212l0.658468-5.0702a68.414778 68.414778 0 0 1 10.601327-26.667935l1.712016-2.370483 6.584675-10.864715q43.656398-72.43143 68.941552-116.021981l3.555725-6.123749v-1.316935A461.98083 461.98083 0 0 1 547.494102 0z m153.949712 307.965271a34.240312 34.240312 0 0 1 34.240312 34.240312v307.965271a34.240312 34.240312 0 1 1-68.414778 0V342.403124a34.240312 34.240312 0 0 1 34.240313-34.437853z m-186.543856 22.058663l115.890288 305.265554a34.240312 34.240312 0 0 1-64.003045 24.297452l-29.82858-78.555178a34.372006 34.372006 0 0 1-6.584675 0.658468H434.303531l-32.923377 81.452435a34.240312 34.240312 0 0 1-40.693294 20.2808l-3.753265-1.251088a34.240312 34.240312 0 0 1-19.029712-44.512406L461.827475 329.233773a34.240312 34.240312 0 0 1 63.739658 0.790161z m-32.923377 106.144968l-30.947974 77.040703h60.183933z" fill="#637381">
            </path>
          </svg>
          }
      />

      {showModelSelector && (
        <Selector
          defaultSelectedValue={currentModel}
          items={models.map((m) => ({
            title: m.displayName,
            value: m.name,
          }))}
          onClose={() => setShowModelSelector(false)}
          onSelection={(s) => {
            if (s.length === 0) return;
            chatStore.updateCurrentSession((session) => {
              session.mask.modelConfig.model = s[0] as ModelType;
              session.mask.syncGlobalConfig = false;
            });
            showToast(s[0]);
          }}
        />
      )}

      <ChatAction
        onClick={()=>{
          useChatSettings.setState({
            useReasoner: !useReasoner
          })
        }}
        selected={useReasoner}
        text={'深度思索'}
        icon={
          <svg style={{ marginTop: '3px' }} viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
            <path d="M927.485057 673.83908v-323.67816a84.156322 84.156322 0 0 0 55.319541-80.625288 82.97931 82.97931 0 0 0-155.365518-42.960919L594.97931 100.045977A86.510345 86.510345 0 0 0 512 11.770115a84.744828 84.744828 0 0 0-82.97931 88.275862L196.56092 223.632184a87.687356 87.687356 0 0 0-72.386207-42.96092A83.567816 83.567816 0 0 0 41.195402 267.181609a83.567816 83.567816 0 0 0 55.319541 80.036782v326.620689a85.921839 85.921839 0 0 0 27.65977 166.547127 82.97931 82.97931 0 0 0 72.386207-42.96092l235.402298 128.882759A86.510345 86.510345 0 0 0 512 1012.229885a84.744828 84.744828 0 0 0 82.97931-88.275862l232.45977-128.882759a82.97931 82.97931 0 0 0 155.365518-40.606896 87.098851 87.098851 0 0 0-55.319541-80.625288z m-772.708046 0h-2.942528v-323.67816l25.305747-14.712644 226.574713 131.825287a130.05977 130.05977 0 0 0-5.296552 28.836782 124.174713 124.174713 0 0 0 5.296552 28.836781z m329.563219 176.551725a85.921839 85.921839 0 0 0-35.898851 25.894252l-241.287356-134.767816a58.850575 58.850575 0 0 0-10.593103-22.951724l235.402298-137.710345a105.342529 105.342529 0 0 0 52.377012 31.779311z m0-461.388506a117.701149 117.701149 0 0 0-52.377012 31.77931L204.8 284.248276l240.698851-134.767816a106.51954 106.51954 0 0 0 38.841379 28.836781z m52.377011-208.91954a91.806897 91.806897 0 0 0 34.133334-27.65977l240.69885 134.767816-221.866666 131.825287a110.050575 110.050575 0 0 0-52.965518-31.77931z m282.482759 558.491954l-240.698851 134.767816a121.232184 121.232184 0 0 0-38.841379-25.894253v-235.402299a124.763218 124.763218 0 0 0 52.377012-31.190805l235.402298 137.121839c-2.354023 4.708046-5.296552 10.593103-8.23908 18.832184z m52.965517-58.850575c0-5.885057 0-5.885057 0 0l-251.88046-151.834483a124.174713 124.174713 0 0 0 5.296552-28.836781 124.174713 124.174713 0 0 0-5.296552-28.836782l226.574713-134.767816 25.305747 17.655172z" fill={useReasoner ? '#fff' : '#637381'}>
            </path>
          </svg>
        }
      />

      {(modelConfig.model === "glm-4v-plus" || modelConfig.model === "deepseekR1") && (
        <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginTop: "-10px",
          marginRight: "6px",
          cursor: 'pointer'
        }}
      >
        <svg
          viewBox="0 0 1024 1024"  
          xmlns="http://www.w3.org/2000/svg"  
          width="24" 
          height="24" 
          onClick={() => {
            // 你可以在这里添加点击事件处理逻辑，例如打开文件选择对话框
            document.getElementById('fileInput')?.click();
          }}>
          <path d="M797.312 198.656a241.92 241.92 0 0 0-341.76 0L194.688 459.456a8.96 8.96 0 0 0-2.624 6.4 8.96 8.96 0 0 0 2.56 6.4l36.928 36.864a8.96 8.96 0 0 0 12.736 0L505.216 248.32a170.432 170.432 0 0 1 121.28-50.176c45.824 0 88.96 17.792 121.216 50.176 32.384 32.448 50.176 75.52 50.176 121.216a170.24 170.24 0 0 1-50.176 121.216l-265.984 265.92-43.136 43.072a103.36 103.36 0 0 1-176.32-72.96c0-27.648 10.752-53.504 30.208-73.024l263.936-263.808a35.264 35.264 0 0 1 24.896-10.304h0.064c9.408 0 18.112 3.712 24.704 10.304a34.88 34.88 0 0 1 0 49.6L390.4 655.04a8.96 8.96 0 0 0-2.56 6.4 8.96 8.96 0 0 0 2.56 6.4l36.928 36.928a8.96 8.96 0 0 0 12.672 0l215.616-215.616c19.84-19.904 30.784-46.272 30.784-74.432 0-28.096-11.008-54.592-30.784-74.368a105.536 105.536 0 0 0-148.992 0l-25.6 25.728-238.208 238.08A172.16 172.16 0 0 0 192 726.848a173.248 173.248 0 0 0 173.44 173.184 172.8 172.8 0 0 0 122.688-50.688l309.12-308.992a240.448 240.448 0 0 0 70.784-170.816 239.68 239.68 0 0 0-70.72-170.88z" fill="#7F7F7F">
          </path>
        </svg>
        {tasks && (
          <div style={{ fontSize: '14px', color: '#637381'}}>
            已上传附件
          </div>
        )}
        <input
          type="file"
          id="fileInput"
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              setTasks(files);
              handleSetImg(files);
            }
          }}
        />
      </div>
      )}
    </div>
  );
}

export function EditMessageModal(props: { onClose: () => void }) {
  const chatStore = useChatStore();
  const session = chatStore.currentSession();
  const [messages, setMessages] = useState(session.messages.slice());

  return (
    <div className="modal-mask">
      <Modal
        title={Locale.Chat.EditMessage.Title}
        onClose={props.onClose}
        actions={[
          <IconButton
            text={Locale.UI.Cancel}
            icon={<CancelIcon />}
            key="cancel"
            onClick={() => {
              props.onClose();
            }}
          />,
          <IconButton
            type="primary"
            text={Locale.UI.Confirm}
            icon={<ConfirmIcon />}
            key="ok"
            onClick={() => {
              chatStore.updateCurrentSession(
                (session) => (session.messages = messages),
              );
              props.onClose();
            }}
          />,
        ]}
      >
        <List>
          <ListItem
            title={Locale.Chat.EditMessage.Topic.Title}
            subTitle={Locale.Chat.EditMessage.Topic.SubTitle}
          >
            <input
              type="text"
              value={session.topic}
              onInput={(e) =>
                chatStore.updateCurrentSession(
                  (session) => (session.topic = e.currentTarget.value),
                )
              }
            ></input>
          </ListItem>
        </List>
        <ContextPrompts
          context={messages}
          updateContext={(updater) => {
            const newMessages = messages.slice();
            updater(newMessages);
            setMessages(newMessages);
          }}
        />
      </Modal>
    </div>
  );
}

function _Chat() {
  type RenderMessage = ChatMessage & { preview?: boolean };

  const chatStore = useChatStore();
  const { useReasoner } = useChatSettings();
  const session = chatStore.currentSession();
  const config = useAppConfig();
  const fontSize = config.fontSize;

  const [showExport, setShowExport] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitDisable, setSubmitDisable] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();
  const { scrollRef, setAutoScroll, scrollDomToBottom } = useScrollToBottom();
  const [hitBottom, setHitBottom] = useState(true);
  const isMobileScreen = useMobileScreen();
  const navigate = useNavigate();

  // prompt hints
  const promptStore = usePromptStore();
  const [promptHints, setPromptHints] = useState<RenderPompt[]>([]);
  const onSearch = useDebouncedCallback(
    (text: string) => {
      const matchedPrompts = promptStore.search(text);
      setPromptHints(matchedPrompts);
    },
    100,
    { leading: true, trailing: true },
  );

  // auto grow input
  const [inputRows, setInputRows] = useState(2);
  const measure = useDebouncedCallback(
    () => {
      const rows = inputRef.current ? autoGrowTextArea(inputRef.current) : 1;
      const inputRows = Math.min(
        20,
        Math.max(2 + Number(!isMobileScreen), rows),
      );
      setInputRows(inputRows);
    },
    100,
    {
      leading: true,
      trailing: true,
    },
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(measure, [userInput]);

  // chat commands shortcuts
  const chatCommands = useChatCommand({
    new: () => chatStore.newSession(),
    newm: () => navigate(Path.NewChat),
    prev: () => chatStore.nextSession(-1),
    next: () => chatStore.nextSession(1),
    clear: () =>
      chatStore.updateCurrentSession(
        (session) => (session.clearContextIndex = session.messages.length),
      ),
    del: () => chatStore.deleteSession(chatStore.currentSessionIndex),
  });

  // only search prompts when user input is short
  const SEARCH_TEXT_LIMIT = 30;
  const onInput = (text: string) => {
    setUserInput(text);
    const n = text.trim().length;

    // clear search results
    if (n === 0) {
      setPromptHints([]);
    } else if (text.startsWith(ChatCommandPrefix)) {
      setPromptHints(chatCommands.search(text));
    } else if (!config.disablePromptHint && n < SEARCH_TEXT_LIMIT) {
      // check if need to trigger auto completion
      if (text.startsWith("/")) {
        let searchText = text.slice(1);
        onSearch(searchText);
      }
    }
  };

  const doSubmit = async (userInput: string) => {
    if (userInput.trim() === "") return;
    const matchCommand = chatCommands.match(userInput);
    const currentFile = useCurrentFile.getState().file ?? { name: "" };
    setLoading(true);
    if (currentFile.name.length > 0) {
      await uploadFile(currentFile);
    }
    const img = useCurrentFile.getState().url;

    if (matchCommand.matched) {
      setUserInput("");
      setPromptHints([]);
      matchCommand.invoke();
      setLoading(false);
      return;
    }

    chatStore.onUserInput(userInput, img).then(() => {
      setIsLoading(false);
      setLoading(false);
      useCurrentFile.setState({ file: null, url: "", shouldCleanImg: true });
    });
    localStorage.setItem(LAST_INPUT_KEY, userInput);
    setUserInput("");
    setPromptHints([]);
    if (!isMobileScreen) inputRef.current?.focus();
    setAutoScroll(true);
  };

  const onPromptSelect = (prompt: RenderPompt) => {
    setTimeout(() => {
      setPromptHints([]);

      const matchedChatCommand = chatCommands.match(prompt.content);
      if (matchedChatCommand.matched) {
        // if user is selecting a chat command, just trigger it
        matchedChatCommand.invoke();
        setUserInput("");
      } else {
        // or fill the prompt
        setUserInput(prompt.content);
      }
      inputRef.current?.focus();
    }, 30);
  };

  // stop response
  const onUserStop = (messageId: string) => {
    ChatControllerPool.stop(session.id, messageId);
  };

  useEffect(() => {
    chatStore.updateCurrentSession((session) => {
      const stopTiming = Date.now() - REQUEST_TIMEOUT_MS;
      session.messages.forEach((m) => {
        // check if should stop all stale messages
        if (m.isError || new Date(m.date).getTime() < stopTiming) {
          if (m.streaming) {
            m.streaming = false;
          }

          if (m.content.length === 0) {
            m.isError = true;
            m.content = prettyObject({
              error: true,
              message: "empty response",
            });
          }
        }
      });

      // auto sync mask config from global config
      if (session.mask.syncGlobalConfig) {
        console.log("[Mask] syncing from global, name = ", session.mask.name);
        session.mask.modelConfig = { ...config.modelConfig };
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // check if should send message
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // if ArrowUp and no userInput, fill with last input
    if (
      e.key === "ArrowUp" &&
      userInput.length <= 0 &&
      !(e.metaKey || e.altKey || e.ctrlKey)
    ) {
      setUserInput(localStorage.getItem(LAST_INPUT_KEY) ?? "");
      e.preventDefault();
      return;
    }
    if (shouldSubmit(e) && promptHints.length === 0) {
      doSubmit(userInput);
      e.preventDefault();
    }
  };
  const onRightClick = (e: any, message: ChatMessage) => {
    // copy to clipboard
    if (selectOrCopy(e.currentTarget, message.content)) {
      if (userInput.length === 0) {
        setUserInput(message.content);
      }

      e.preventDefault();
    }
  };

  const deleteMessage = (msgId?: string) => {
    chatStore.updateCurrentSession(
      (session) =>
        (session.messages = session.messages.filter((m) => m.id !== msgId)),
    );
  };

  const onDelete = (msgId: string) => {
    deleteMessage(msgId);
  };

  const onResend = (message: ChatMessage) => {
    // when it is resending a message
    // 1. for a user's message, find the next bot response
    // 2. for a bot's message, find the last user's input
    // 3. delete original user input and bot's message
    // 4. resend the user's input

    const resendingIndex = session.messages.findIndex(
      (m) => m.id === message.id,
    );

    if (resendingIndex < 0 || resendingIndex >= session.messages.length) {
      console.error("[Chat] failed to find resending message", message);
      return;
    }

    let userMessage: ChatMessage | undefined;
    let botMessage: ChatMessage | undefined;

    if (message.role === "assistant") {
      // if it is resending a bot's message, find the user input for it
      botMessage = message;
      for (let i = resendingIndex; i >= 0; i -= 1) {
        if (session.messages[i].role === "user") {
          userMessage = session.messages[i];
          break;
        }
      }
    } else if (message.role === "user") {
      // if it is resending a user's input, find the bot's response
      userMessage = message;
      for (let i = resendingIndex; i < session.messages.length; i += 1) {
        if (session.messages[i].role === "assistant") {
          botMessage = session.messages[i];
          break;
        }
      }
    }

    if (userMessage === undefined) {
      console.error("[Chat] failed to resend", message);
      return;
    }

    // delete the original messages
    deleteMessage(userMessage.id);
    deleteMessage(botMessage?.id);

    // resend the message
    setIsLoading(true);
    chatStore.onUserInput(userMessage.content).then(() => setIsLoading(false));
    inputRef.current?.focus();
  };

  const onPinMessage = (message: ChatMessage) => {
    chatStore.updateCurrentSession((session) =>
      session.mask.context.push(message),
    );

    showToast(Locale.Chat.Actions.PinToastContent, {
      text: Locale.Chat.Actions.PinToastAction,
      onClick: () => {
        setShowPromptModal(true);
      },
    });
  };

  const context: RenderMessage[] = useMemo(() => {
    return session.mask.hideContext ? [] : session.mask.context.slice();
  }, [session.mask.context, session.mask.hideContext]);
  const accessStore = useAccessStore();

  if (
    context.length === 0 &&
    session.messages.at(0)?.content !== BOT_HELLO.content
  ) {
    const copiedHello = Object.assign({}, BOT_HELLO);
    if (!accessStore.isAuthorized()) {
      copiedHello.content = Locale.Error.Unauthorized;
    }
    context.push(copiedHello);
  }

  // preview messages
  const renderMessages = useMemo(() => {
    return context
      .concat(session.messages as RenderMessage[])
      .concat(
        isLoading
          ? [
              {
                ...createMessage({
                  role: "assistant",
                  content: "……",
                }),
                preview: true,
              },
            ]
          : [],
      )
      .concat(
        userInput.length > 0 && config.sendPreviewBubble
          ? [
              {
                ...createMessage({
                  role: "user",
                  content: userInput,
                }),
                preview: true,
              },
            ]
          : [],
      );
  }, [
    config.sendPreviewBubble,
    context,
    isLoading,
    session.messages,
    userInput,
  ]);

  const [msgRenderIndex, _setMsgRenderIndex] = useState(
    Math.max(0, renderMessages.length - CHAT_PAGE_SIZE),
  );
  function setMsgRenderIndex(newIndex: number) {
    newIndex = Math.min(renderMessages.length - CHAT_PAGE_SIZE, newIndex);
    newIndex = Math.max(0, newIndex);
    _setMsgRenderIndex(newIndex);
  }

  const messages = useMemo(() => {
    const endRenderIndex = Math.min(
      msgRenderIndex + 3 * CHAT_PAGE_SIZE,
      renderMessages.length,
    );
    return renderMessages.slice(msgRenderIndex, endRenderIndex);
  }, [msgRenderIndex, renderMessages]);

  const onChatBodyScroll = (e: HTMLElement) => {
    const bottomHeight = e.scrollTop + e.clientHeight;
    const edgeThreshold = e.clientHeight;

    const isTouchTopEdge = e.scrollTop <= edgeThreshold;
    const isTouchBottomEdge = bottomHeight >= e.scrollHeight - edgeThreshold;
    const isHitBottom =
      bottomHeight >= e.scrollHeight - (isMobileScreen ? 4 : 10);

    const prevPageMsgIndex = msgRenderIndex - CHAT_PAGE_SIZE;
    const nextPageMsgIndex = msgRenderIndex + CHAT_PAGE_SIZE;

    if (isTouchTopEdge && !isTouchBottomEdge) {
      setMsgRenderIndex(prevPageMsgIndex);
    } else if (isTouchBottomEdge) {
      setMsgRenderIndex(nextPageMsgIndex);
    }

    setHitBottom(isHitBottom);
    setAutoScroll(isHitBottom);
  };

  function scrollToBottom() {
    setMsgRenderIndex(renderMessages.length - CHAT_PAGE_SIZE);
    scrollDomToBottom();
  }

  // clear context index = context length + index in messages
  const clearContextIndex =
    (session.clearContextIndex ?? -1) >= 0
      ? session.clearContextIndex! + context.length - msgRenderIndex
      : -1;

  const [showPromptModal, setShowPromptModal] = useState(false);

  const clientConfig = useMemo(() => getClientConfig(), []);

  const autoFocus = !isMobileScreen; // wont auto focus on mobile screen
  const showMaxIcon = !isMobileScreen && !clientConfig?.isApp;

  useCommand({
    fill: setUserInput,
    submit: (text) => {
      doSubmit(text);
    },
    code: (text) => {
      if (accessStore.disableFastLink) return;
      console.log("[Command] got code from url: ", text);
      showConfirm(Locale.URLCommand.Code + `code = ${text}`).then((res) => {
        if (res) {
          accessStore.update((access) => (access.accessCode = text));
        }
      });
    },
    settings: (text) => {
      if (accessStore.disableFastLink) return;

      try {
        const payload = JSON.parse(text) as {
          key?: string;
          url?: string;
        };

        console.log("[Command] got settings from url: ", payload);

        if (payload.key || payload.url) {
          showConfirm(
            Locale.URLCommand.Settings +
              `\n${JSON.stringify(payload, null, 4)}`,
          ).then((res) => {
            if (!res) return;
            if (payload.key) {
              accessStore.update(
                (access) => (access.openaiApiKey = payload.key!),
              );
            }
            if (payload.url) {
              accessStore.update((access) => (access.openaiUrl = payload.url!));
            }
          });
        }
      } catch {
        console.error("[Command] failed to get settings from url: ", text);
      }
    },
  });

  // edit / insert message modal
  const [isEditingMessage, setIsEditingMessage] = useState(false);

  // remember unfinished input
  useEffect(() => {
    // try to load from local storage
    const key = UNFINISHED_INPUT(session.id);
    const mayBeUnfinishedInput = localStorage.getItem(key);
    if (mayBeUnfinishedInput && userInput.length === 0) {
      setUserInput(mayBeUnfinishedInput);
      localStorage.removeItem(key);
    }

    const dom = inputRef.current;
    return () => {
      localStorage.setItem(key, dom?.value ?? "");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.chat} key={session.id}>
      <div className="window-header" data-tauri-drag-region>
        {isMobileScreen && (
          <div className="window-actions">
            <div className={"window-action-button"}>
              <IconButton
                icon={<ReturnIcon />}
                bordered
                title={Locale.Chat.Actions.ChatList}
                onClick={() => navigate(Path.Home)}
              />
            </div>
          </div>
        )}

        <div className={`window-header-title ${styles["chat-body-title"]}`}>
          <div
            className={`window-header-main-title ${styles["chat-body-main-title"]}`}
            onClickCapture={() => setIsEditingMessage(true)}
          >
            {!session.topic ? DEFAULT_TOPIC : session.topic}
          </div>
          <div className="window-header-sub-title">
            {Locale.Chat.SubTitle(session.messages.length)}
          </div>
        </div>
        <div className="window-actions">
          {!isMobileScreen && (
            <div className="window-action-button">
              <IconButton
                icon={<RenameIcon />}
                bordered
                onClick={() => setIsEditingMessage(true)}
              />
            </div>
          )}
          <div className="window-action-button">
            <IconButton
              icon={<ExportIcon />}
              bordered
              title={Locale.Chat.Actions.Export}
              onClick={() => {
                setShowExport(true);
              }}
            />
          </div>
          {showMaxIcon && (
            <div className="window-action-button">
              <IconButton
                icon={config.tightBorder ? <MinIcon /> : <MaxIcon />}
                bordered
                onClick={() => {
                  config.update(
                    (config) => (config.tightBorder = !config.tightBorder),
                  );
                }}
              />
            </div>
          )}
        </div>

        <PromptToast
          showToast={!hitBottom}
          showModal={showPromptModal}
          setShowModal={setShowPromptModal}
        />
      </div>

      <div
        className={styles["chat-body"]}
        ref={scrollRef}
        onScroll={(e) => onChatBodyScroll(e.currentTarget)}
        onMouseDown={() => inputRef.current?.blur()}
        onTouchStart={() => {
          inputRef.current?.blur();
          setAutoScroll(false);
        }}
      >
        {messages.map((message, i) => {
          const isUser = message.role === "user";
          const isContext = i < context.length;
          const showActions =
            i > 0 &&
            !(message.preview || message.content.length === 0) &&
            !isContext;
          const showTyping = message.preview || message.streaming;

          const shouldShowClearContextDivider = i === clearContextIndex - 1;

          return (
            <Fragment key={message.id}>
              <div
                className={
                  isUser ? styles["chat-message-user"] : styles["chat-message"]
                }
              >
                <div className={styles["chat-message-container"]}>
                  <div className={styles["chat-message-header"]}>
                    <div className={styles["chat-message-avatar"]}>
                      <div className={styles["chat-message-edit"]}>
                        <IconButton
                          icon={<EditIcon />}
                          onClick={async () => {
                            const newMessage = await showPrompt(
                              Locale.Chat.Actions.Edit,
                              message.content,
                              10,
                            );
                            chatStore.updateCurrentSession((session) => {
                              const m = session.mask.context
                                .concat(session.messages)
                                .find((m) => m.id === message.id);
                              if (m) {
                                m.content = newMessage;
                              }
                            });
                          }}
                        ></IconButton>
                      </div>
                      {isUser ? (
                        <Avatar avatar={config.avatar} />
                      ) : (
                        <>
                          {["system"].includes(message.role) ? (
                            <Avatar avatar="2699-fe0f" />
                          ) : (
                            <MaskAvatar
                              avatar={session.mask.avatar}
                              model={
                                message.model || session.mask.modelConfig.model
                              }
                            />
                          )}
                        </>
                      )}
                    </div>

                    {showActions && (
                      <div className={styles["chat-message-actions"]}>
                        <div className={styles["chat-input-actions"]}>
                          {message.streaming ? (
                            <ChatAction
                              text={Locale.Chat.Actions.Stop}
                              icon={<StopIcon />}
                              onClick={() => onUserStop(message.id ?? i)}
                            />
                          ) : (
                            <>
                              <ChatAction
                                text={Locale.Chat.Actions.Retry}
                                icon={<ResetIcon />}
                                onClick={() => onResend(message)}
                              />

                              <ChatAction
                                text={Locale.Chat.Actions.Delete}
                                icon={<DeleteIcon />}
                                onClick={() => onDelete(message.id ?? i)}
                              />

                              <ChatAction
                                text={Locale.Chat.Actions.Pin}
                                icon={<PinIcon />}
                                onClick={() => onPinMessage(message)}
                              />
                              <ChatAction
                                text={Locale.Chat.Actions.Copy}
                                icon={<CopyIcon />}
                                onClick={() => copyToClipboard(message.content)}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {showTyping && (
                    <div className={styles["chat-message-status"]}>
                      {Locale.Chat.Typing}
                    </div>
                  )}
                  <div className={styles["chat-message-item"]}>
                    <Markdown
                      content={message.content}
                      loading={
                        (message.preview || message.streaming) &&
                        message.content.length === 0 &&
                        !isUser
                      }
                      onContextMenu={(e) => onRightClick(e, message)}
                      onDoubleClickCapture={() => {
                        if (!isMobileScreen) return;
                        setUserInput(message.content);
                      }}
                      fontSize={fontSize}
                      parentRef={scrollRef}
                      defaultShow={i >= messages.length - 6}
                      img={message.img}
                    />
                  </div>

                  <div className={styles["chat-message-action-date"]}>
                    {isContext
                      ? Locale.Chat.IsContext
                      : message.date.toLocaleString()}
                  </div>
                </div>
              </div>
              {shouldShowClearContextDivider && <ClearContextDivider />}
            </Fragment>
          );
        })}
      </div>

      <div className={styles["chat-input-panel"]}>
        <PromptHints prompts={promptHints} onPromptSelect={onPromptSelect} />

        <ChatActions
          showPromptModal={() => setShowPromptModal(true)}
          scrollToBottom={scrollToBottom}
          hitBottom={hitBottom}
          showPromptHints={() => {
            // Click again to close
            if (promptHints.length > 0) {
              setPromptHints([]);
              return;
            }

            inputRef.current?.focus();
            setUserInput("/");
            onSearch("");
          }}
        />
        <div className={styles["chat-input-panel-inner"]}>
          <textarea
            ref={inputRef}
            className={styles["chat-input"]}
            placeholder={Locale.Chat.Input(submitKey)}
            onInput={(e) => onInput(e.currentTarget.value)}
            value={userInput}
            onKeyDown={onInputKeyDown}
            onFocus={scrollToBottom}
            onClick={scrollToBottom}
            rows={inputRows}
            autoFocus={autoFocus}
            style={{
              fontSize: config.fontSize,
            }}
          />
          <IconButton
            disabled={loading}
            icon={<SendWhiteIcon />}
            text={Locale.Chat.Send}
            className={styles["chat-input-send"]}
            type="primary"
            onClick={() => doSubmit(userInput)}
          />
        </div>
      </div>

      {showExport && (
        <ExportMessageModal onClose={() => setShowExport(false)} />
      )}

      {isEditingMessage && (
        <EditMessageModal
          onClose={() => {
            setIsEditingMessage(false);
          }}
        />
      )}
    </div>
  );
}

export function Chat() {
  const chatStore = useChatStore();
  const sessionIndex = chatStore.currentSessionIndex;
  return <_Chat key={sessionIndex}></_Chat>;
}
