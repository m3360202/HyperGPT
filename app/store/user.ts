import { create } from "zustand";

// 定义 User 类型
interface User {
  id: string;
  email: string;
  nickName: string;
  userName: string;
  avatar: string;
  mobile: string;
  type: string;
  credits: number;
  roles: string;
  token: string;
}

// 使用泛型参数创建 useUser store
export const useUser = create<User>((set) => ({
  id: "",
  email: "",
  nickName: "",
  userName: "",
  avatar: "",
  mobile: "",
  type: "",
  credits: 0,
  roles: "user",
  token: "",

  // 这里可以添加其他 actions 和 selectors
}));
