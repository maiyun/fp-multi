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

[简体中文](./doc/README.sc.md)

A plugin that enables multi-user support for [frp](https://github.com/fatedier/frp), with restrictions on proxy names, proxy types, and port ranges per user. Supports file token / server authentication modes.

## Note

Before using this plugin, ensure you have a basic understanding of [frp](https://github.com/fatedier/frp) usage and configuration file formats.

## Usage

In a Node.js 22+ environment, install fp-multi globally:

```sh
$ npm i fp-multi -g
```

### Configure frps

```toml
[[httpPlugins]]
addr = "127.0.0.1:7200"
path = "/handler"
ops = ["Login", "NewProxy"]
```

Port 7200 can be customized, see [Configuration File](#configuration-file).

### Configure frpc

It's recommended to set `loginFailExit` to `false` so that `frpc` won't exit when login fails or network connection is lost, but will continue trying to login.

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

### Direct Startup

```sh
$ fpmulti -c /etc/fp-multi/config.json
```

After starting, launch `frps` to begin normal usage.

### systemd Startup

1. Create a service file

```sh
$ sudo nano /etc/systemd/system/fpmulti.service
```

2. Write the file content

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

3. It's recommended to coordinate with frps service so that when frps service starts automatically, it also forces `fpmulti.service` to start. Create `frps.service` file:

```sh
$ sudo nano /etc/systemd/system/frps.service
```

4. Write the file content

```
[Unit]
Description = frp server
After = fpmulti.service
Requires = fpmulti.service

[Service]
Type = simple
# Command to start frps, modify to actual frps path
ExecStart = /path/to/frps -c /path/to/frps.toml

[Install]
WantedBy = multi-user.target
```

5. Set `frps.service` to start on boot

```sh
$ sudo systemctl enable frps
```

## Configuration File

### Configuration File Example

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

If any of `name`, `type`, or `port` doesn't meet the rules, the connection will be rejected. `name` supports regular expressions, and `port` supports port ranges.

### Simplified Configuration File Example

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

### Authentication Order

If `users` authentication fails, it will then request the `server`. If `server` authentication also fails, the connection will be rejected. So you can either not configure `users` and only configure `server`, or only configure `users` without `server`.

```json
{
    "port": 7200,
    "server": {
        "url": "https://example.com/auth",
        "auth": "auth1"
    }
}
```

With the above configuration, authentication is completely handled by you.

### Server Authentication

When `users` is not configured or `users` authentication fails, data will be POSTed to the `server`, and it must return in the specified format.

#### Sent Data Format

##### login

When frpc connects to frps, it sends a `login` action. `auth` is the `server.auth` from fp-multi configuration file, `user` is the `user` from frpc configuration file, and `token` is the `metadatas.token` from frpc configuration file.

```json
{
    "action": "login",
    "auth": "auth1",
    "user": "user1",
    "token": "token1",
}
```

##### new

After frpc successfully connects to frps, it will create proxies according to [[proxies]] configuration in sequence. At this point, a `new` action is initiated. `user` and `token` are sent again, and you must re-validate the user's legitimacy in this action before validating other proxy fields.

`port` is the `remotePort` from frpc configuration file.

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

#### Return Data Format

```json
{
    "result": 1
}
```

A `result` greater than 0 indicates permission, while less than or equal to 0 indicates rejection.

#### auth

The `server.auth` value from fp-multi will be sent as-is to prevent third parties from making unauthorized requests to your authentication interface.

## License

This library is published under [AGPL-3.0](./LICENSE) license.