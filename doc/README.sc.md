# fp-multi

<p align="center">
    <a href="https://github.com/maiyun/fp-multi/blob/master/LICENSE">
        <img alt="License" src="https://img.shields.io/github/license/maiyun/fp-multi?color=blue" />
    </a>
    <a href="https://www.npmjs.com/package/fp-multi">
        <img alt="NPM stable version" src="https://img.shields.io/npm/v/fp-multi?color=brightgreen&logo=npm" />
    </a>
    <a href="https://github.com/maiyun/fp-multi/releases">
        <img alt="GitHub releases" src="https://img.shields.io/github/v/release/maiyun/fp-multi?color=brightgreen&logo=github" />
    </a>
    <a href="https://github.com/maiyun/fp-multi/issues">
        <img alt="GitHub issues" src="https://img.shields.io/github/issues/maiyun/fp-multi?color=blue&logo=github" />
    </a>
</p>

让 [frp](https://github.com/fatedier/frp) 支持多用户的插件，可限制单用户的代理名称、代理类型、端口范围。支持文件 token / server 鉴权模式。

## 注意

使用本插件前，请确保已经了解了 [frp](https://github.com/fatedier/frp) 的基本使用方法和配置文件的格式。

## 使用

在 Node.js 22+ 的环境下，全局安装 fp-multi

```sh
$ npm i fp-multi -g
```

### 配置 frps

```toml
[[httpPlugins]]
addr = "127.0.0.1:7200"
path = "/handler"
ops = ["Login", "NewProxy"]
```

端口 7200 可自定义，参见 [配置文件](#配置文件)。

### 配置 frpc

建议将 `loginFailExit` 设置为 `false`，这样当用户登录失败或网络连接失败时，`frpc` 不会退出，而是继续尝试登录。

#### user1

```toml
serverAddr = "127.0.0.1"
loginFailExit = false
user = "user1"
metadatas.token = "token1"

[[proxies]]
name = "user1-6000"
type = "tcp"
localIP = "127.0.0.1"
localPort = 22
remotePort = 6000
```

#### user2

```toml
serverAddr = "127.0.0.1"
loginFailExit = false
user = "user2"
metadatas.token = "token2"

[[proxies]]
name = "user2"
type = "tcp"
localPort = 22
remotePort = 6001
```

### 直接启动

```sh
$ fpmulti -c /etc/fp-multi/config.json
```

启动后再启动 `frps` 即可正常使用。

### systemd 启动

1. 创建 service 文件

```sh
$ sudo nano /etc/systemd/system/fpmulti.service
```

2. 写入文件内容

```sh
[Unit]
Description = fp multi
After = network.target syslog.target
Wants = network.target

[Service]
Type = simple
ExecStart = fpmulti -c /etc/fp-multi/config.json

[Install]
WantedBy = multi-user.target
```

3. 建议和 frps 的 service 配合，这样让 frps 的 service 自动启动时也强制启动 `fpmulti.service`，创建 `frps.service` 文件

```sh
$ sudo nano /etc/systemd/system/frps.service
```

4. 写入文件内容

```
[Unit]
Description = frp server
After = fpmulti.service
Requires = fpmulti.service

[Service]
Type = simple
# 启动 frps 的命令，需修改为实际的 frps 的路径
ExecStart = /path/to/frps -c /path/to/frps.toml

[Install]
WantedBy = multi-user.target
```

5. 设置 `frps.service` 开机自启

```sh
$ sudo systemctl enable frps
```

## 配置文件

### 配置文件示例

```json
{
    "port": 7200,
    "users": [
        {
            "user": "user1",
            "token": "token1",
            "name": [
                "user1",
                "/user1-[0-9]+/"
            ],
            "type": [
                "tcp",
                "udp"
            ],
            "port": [
                "7000-7010",
                "7020-7030",
                "8000"
            ]
        }
    ],
    "server": {
        "url": "https://example.com/auth",
        "auth": "auth1"
    }
}
```

其中 `name`、`type`、`port` 只要有其中一个不符合规则，就会拒绝连接。其中 `name` 支持正则表达式，`port` 支持端口范围。

### 简化配置文件示例

```json
{
    "port": 7200,
    "users": [
        {
            "user": "user1",
            "token": "token1"
        }
    ]
}
```

### 鉴权顺序

如果 `users` 未通过校验，才会请求 `server`，如果 `server` 也未通过校验，就会拒绝连接。所以你也可以完全不配置 `users`，只配置 `server`，也可以只配置 `users` 不配置 `server`。

```json
{
    "port": 7200,
    "server": {
        "url": "https://example.com/auth",
        "auth": "auth1"
    }
}
```

如上配置的话鉴权完全交给你自行处理。

### server 鉴权

在没有配置 `users` 或 `users` 校验失败的情况下，则会将数据 POST 到 `server`，必须按照格式进行返回。

#### 发送数据格式

##### login

frpc 连接 frps 时，会发送 `login` 动作，`auth` 为 fp-multi 配置文件中的 `server.auth`，`user` 为 frpc 配置文件中的 `user`，`token` 为 frpc 配置文件中的 `metadatas.token`。

```json
{
    "action": "login",
    "auth": "auth1",
    "user": "user1",
    "token": "token1",
}
```

##### new

frpc 成功连接 frps 后，将根据 [[proxies]] 配置依次创建代理，此时会发起 `new` 动作，`user`，`token` 依然会再发送一次，在本动作你依然要再次校验一次用户是否合法，然后再校验其他代理字段。

`port` 为 frpc 配置文件中的 `remotePort`。

```json
{
    "action": "new",
    "auth": "auth1",
    "user": "user1",
    "token": "token1",
    "name": "user1-1",
    "type": "tcp",
    "port": 7000
}
```

#### 返回数据格式

```json
{
    "result": 1
}
```

只要 `result` 大于 0 即为允许，小于等于 0 即为拒绝。

#### auth

fp-multi 端会将 `server.auth` 的值透穿发送，以防止第三方非法请求你的鉴权接口。

## 许可

fp-multi 基于 [AGPL-3.0](./LICENSE) 协议发布。
