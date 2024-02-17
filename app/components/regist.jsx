import React, { useEffect, useState } from "react";
import { Typography, Cell, Input, Button, Image, Dialog } from "react-vant";
import { useUser } from "../store/user";
import axios from "axios";
import "./signin.scss"; // Assuming the CSS file is named LoginForm.css
import { useNavigate } from "react-router-dom";
import { Path } from "../constant";

export function validateMobile(mobile) {
  const regex = /^1[345789]\d{9}$/;
  return regex.test(mobile);
}

export function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [repass, setRepass] = useState("");
  const navigate = useNavigate();

  const register = () => {
    if (!validateMobile(username)) {
      return Dialog.alert({
        title: "注册错误",
        message: "请输入合法的手机号",
      });
    }
    if (password.length < 8) {
      return Dialog.alert({
        title: "注册错误",
        message: "密码长度8-16字符",
      });
    }
    if (repass !== password) {
      return Dialog.alert({
        title: "注册错误",
        message: "两次密码输入不一致",
      });
    }
    let formData = { username, password, repass };

    axios
      .post("https://ai.aliensoft.com.cn/api/register", formData)
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
            title: "注册失败",
            message: res.data.message,
          });
        }
      })
      .catch((e) => {
        console.log("e", e);
      });
  };

  return (
    <div>
      <div className="bg"></div>
      <div className="main">
        <div className="contain">
          <div className="header">新视野即将打开...</div>
          <div className="content">
            <div className="block">
              <Cell>
                <Input
                  type="tel"
                  placeholder="手机号码"
                  size="large"
                  maxlength="11"
                  autocomplete="off"
                  value={username}
                  onChange={(e) => {
                    setUsername(e);
                  }}
                  prefix="+86 "
                ></Input>
              </Cell>
            </div>

            <div className="block">
              <Cell>
                <Input
                  size="large"
                  maxLength={11}
                  value={password}
                  onChange={(e) => {
                    setPassword(e);
                  }}
                  placeholder="请输入密码(8-16位)"
                  autocomplete="off"
                ></Input>
              </Cell>
            </div>

            <div className="block">
              <Cell>
                <Input
                  value={repass}
                  onChange={(e) => {
                    setRepass(e);
                  }}
                  placeholder="重复密码(8-16位)"
                  size="large"
                  maxlength="16"
                  show-password
                  autocomplete="off"
                ></Input>
              </Cell>
            </div>

            <div className="btn-row">
              <Button
                className="login-btn"
                size="large"
                type="primary"
                onClick={register}
              >
                注册
              </Button>
            </div>

            <div className="text-line">
              已经有账号？
              <a
                type="primary"
                onClick={() => {
                  navigate(Path.Signin);
                }}
              >
                登录
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
