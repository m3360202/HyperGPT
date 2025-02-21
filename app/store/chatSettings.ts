import { create } from "zustand";

interface CHATSETTINGS {
  useReasoner: boolean;
}

// 使用泛型参数创建 useCurrentFile store
export const useChatSettings = create<CHATSETTINGS>((set) => ({
  useReasoner: false
}));
