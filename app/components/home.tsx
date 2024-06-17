"use client";

require("../polyfill");

import { useState, useEffect } from "react";

import styles from "./home.module.scss";

import BotIcon from "../icons/bot.svg";
import LoadingIcon from "../icons/three-dots.svg";

import { getCSSVar, useMobileScreen } from "../utils";

import dynamic from "next/dynamic";
import { ModelProvider, Path, SlotID } from "../constant";
import { ErrorBoundary } from "./error";
import { Link, useNavigate } from "react-router-dom";
import { getISOLang, getLang } from "../locales";

import {
  HashRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { SideBar } from "./sidebar";
import { useAppConfig } from "../store/config";
import { AuthPage } from "./auth";
import { getClientConfig } from "../config/client";
import { ClientApi } from "../client/api";
import { useAccessStore } from "../store";
import { useUser } from "../store/user";
import axios from "axios";

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={styles["loading-content"] + " no-dark"}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const Chat = dynamic(async () => (await import("./chat")).Chat, {
  loading: () => <Loading noLogo />,
});

const NewChat = dynamic(async () => (await import("./new-chat")).NewChat, {
  loading: () => <Loading noLogo />,
});

const MaskPage = dynamic(async () => (await import("./mask")).MaskPage, {
  loading: () => <Loading noLogo />,
});

const Signin = dynamic(async () => (await import("./signin")).SignIn, {
  loading: () => <Loading noLogo />,
});

const Regist = dynamic(async () => (await import("./regist")).RegisterPage, {
  loading: () => <Loading noLogo />,
});

export function useSwitchTheme() {
  const config = useAppConfig();

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");

    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const metaDescriptionDark = document.querySelector(
      'meta[name="theme-color"][media*="dark"]',
    );
    const metaDescriptionLight = document.querySelector(
      'meta[name="theme-color"][media*="light"]',
    );

    if (config.theme === "auto") {
      metaDescriptionDark?.setAttribute("content", "#151515");
      metaDescriptionLight?.setAttribute("content", "#fafafa");
    } else {
      const themeColor = getCSSVar("--theme-color");
      metaDescriptionDark?.setAttribute("content", themeColor);
      metaDescriptionLight?.setAttribute("content", themeColor);
    }
  }, [config.theme]);
}

function useHtmlLang() {
  useEffect(() => {
    const lang = getISOLang();
    const htmlLang = document.documentElement.lang;

    if (lang !== htmlLang) {
      document.documentElement.lang = lang;
    }
  }, []);
}

const useHasHydrated = () => {
  const [hasHydrated, setHasHydrated] = useState<boolean>(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
};

const loadAsyncGoogleFont = () => {
  const linkEl = document.createElement("link");
  const proxyFontUrl = "/google-fonts";
  const remoteFontUrl = "https://fonts.googleapis.com";
  const googleFontUrl =
    getClientConfig()?.buildMode === "export" ? remoteFontUrl : proxyFontUrl;
  linkEl.rel = "stylesheet";
  linkEl.href =
    googleFontUrl +
    "/css2?family=" +
    encodeURIComponent("Noto Sans:wght@300;400;700;900") +
    "&display=swap";
  document.head.appendChild(linkEl);
};

function Screen() {
  const token = localStorage.getItem("token");
  const navigate = useNavigate();
  const config = useAppConfig();
  const location = useLocation();
  const isHome = location.pathname === Path.Home;
  const isAuth = location.pathname === Path.Auth;
  const isMobileScreen = useMobileScreen();
  const [showPic, setShowPic] = useState(false)
  const [num, setNum] = useState(15)
  const shouldTightBorder =
    getClientConfig()?.isApp || (config.tightBorder && !isMobileScreen);

  useEffect(() => {
    loadAsyncGoogleFont();

    if (token && !useUser.getState().id) {
      axios
        .post("https://ai.aliensoft.com.cn/api/token", { token })
        .then((res) => {
          console.log(res);
          
          if(!localStorage.getItem("username")) {
            localStorage.setItem("username", res.data.data.username);
            console.log('test----')
            if(res.data.data.username == '18611066087'){
              setShowPic(true)
              setTimeout(() => {
                setShowPic(false)
              }, 15000)
              setInterval(() => {
                setNum(prevNum => prevNum - 1);
              }, 1000);
            }
          }
        })
        .catch((err) => {
          console.log(err);
        });
    }
  }, []);
  console.log(
    "location.pathname",
    location.pathname,
    location.pathname.indexOf("regist"),
  );
  return (
    <div
      className={
        styles.container +
        ` ${shouldTightBorder ? styles["tight-container"] : styles.container} ${
          getLang() === "ar" ? styles["rtl-screen"] : ""
        }`
      }
    >
      {!token ? (
        <>
          {location.pathname.indexOf("regist") === -1 && <Signin />}
          {location.pathname.indexOf("regist") > -1 && <Regist />}
        </>
      ) : (
        <>
          <SideBar className={isHome ? styles["sidebar-show"] : ""} />

          <div className={styles["window-content"]} id={SlotID.AppBody}>
            <Routes>
              <Route path={Path.Home} element={<Chat />} />
              <Route path={Path.NewChat} element={<NewChat />} />
              <Route path={Path.Masks} element={<MaskPage />} />
              <Route path={Path.Chat} element={<Chat />} />
              <Route path={Path.Settings} element={<Settings />} />
            </Routes>
          </div>
          {showPic && (<div style={{width:'600px', height:'700px',margin:'0 auto',zIndex:'999',backgroundColor:'#fff',borderRadius:'10px',border:'#e4e4e4 1px solid',textAlign:'center',
        boxShadow:'0 0 10px #ccc',position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',padding:'20px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center'
        }}>
            <img src="http://bdygj.aliensoft.com.cn/aaa.jpg" width="360" height="640" style={{marginBottom:'20px'}} />
            Hello明明，我昨天更新了一个新的版本，只是为了在这个无聊的周二早晨say good morning，工作是枯燥的，偶尔来点点缀也是必要的，今天要有好心情
            窗口将在{num}秒内关闭
          </div>)}
        </>
      )}
    </div>
  );
}

export function useLoadData() {
  const config = useAppConfig();

  var api: ClientApi;
  if (config.modelConfig.model === "gemini-pro") {
    api = new ClientApi(ModelProvider.GeminiPro);
  } else if (
    ["glm-4", "glm-4v", "chatglm_pro"].includes(config.modelConfig.model)
  ) {
    api = new ClientApi(ModelProvider.GLM);
  } else {
    api = new ClientApi(ModelProvider.GLM);
  }
  useEffect(() => {
    (async () => {
      const models = await api.llm.models();
      config.mergeModels(models);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Home() {
  useSwitchTheme();
  useLoadData();
  useHtmlLang();

  useEffect(() => {
    console.log("[Config] got config from build time", getClientConfig());
    useAccessStore.getState().fetch();
  }, []);

  if (!useHasHydrated()) {
    return <Loading />;
  }

  return (
    <ErrorBoundary>
      <Router>
        <Screen />
      </Router>
    </ErrorBoundary>
  );
}
