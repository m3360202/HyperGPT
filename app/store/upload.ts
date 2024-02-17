import { create } from "zustand";

// 定义 CurrentFile 类型
interface CurrentFile {
  id: string;
  url: string;
}

// 使用泛型参数创建 useCurrentFile store
export const useCurrentFile = create<CurrentFile>((set) => ({
  id: "",
  url: "",
}));
