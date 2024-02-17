import React, { useEffect, useState } from "react";
import { Typography, Cell, Input, Button, Image, Dialog } from "react-vant";
import { useUser } from "../store/user";
import axios from "axios";
import "./signin.scss"; // Assuming the CSS file is named LoginForm.css
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";

export function validateEmail(email: string) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validateMobile(mobile: string) {
  const regex = /^1[345789]\d{9}$/;
  return regex.test(mobile);
}

export function SignIn() {
  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const login = () => {
    if (!validateMobile(username)) {
      return Dialog.alert({
        title: "登录错误",
        message: "请输入正确的手机号码作为您的登录用户名",
      });
    }
    if (password.trim() === "") {
      return Dialog.alert({
        title: "登录错误",
        message: "请输入密码",
      });
    }
    axios
      .post("https://ai.aliensoft.com.cn/api/signin", { username, password })
      .then((res) => {
        if (res.data.success) {
          let token = res.data.data.token;
          localStorage.setItem("token", token);
          useUser.setState({
            id: res.data.data.id,
            avatar: res.data.data.avatar,
            userName: res.data.data.username,
            token: res.data.data.token,
          });
          navigate(Path.Home);
        } else {
          return Dialog.alert({
            title: "登录错误",
            message: res.data.message,
          });
        }
      })
      .catch((err) => {
        console.log(err);
      });
  };

  return (
    <div>
      <div className="bg"></div>
      <div className="main">
        <div className="contain">
          <div className="logo">
            <Image src="images/logo.png" />
          </div>
          <Typography.Title level={2} className="header">
            HyperGPT 用户登录
          </Typography.Title>
          <div className="content">
            <div className="block">
              <Cell>
                <Input
                  placeholder="手机号"
                  type="tel"
                  maxLength={11}
                  value={username}
                  onChange={(e) => {
                    setUsername(e);
                  }}
                  prefix="+86 "
                />
              </Cell>
            </div>
            <div className="block">
              <Cell>
                <Input
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e)}
                  prefix=""
                />
              </Cell>
            </div>
            <div className="btn-row">
              <Button
                className="login-btn"
                size="large"
                type="primary"
                onClick={login}
              >
                登录
              </Button>
            </div>
            <div className="text-line">
              还没有账号？
              <Typography.Text
                type="primary"
                onClick={() => navigate(Path.Regist)}
              >
                注册新账号
              </Typography.Text>
            </div>
          </div>
        </div>
        <footer className="footer">
          <div className="container">
            <div className="footer">
              Powered by Kiddyu JustGoodLuck @
              <a
                type="primary"
                href="https://github.com/m3360202/"
                target="_blank"
                style={{ color: "#fff" }}
              >
                {" "}
                HyperGpt
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
