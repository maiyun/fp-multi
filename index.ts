/**
 * Project: fp-multi, User: JianSuoQiYue
 * Date: 2025-8-1 11:15:09
 */

// npm publish --access public

/**
 * test:
 * node ./index -c ./demo-config.json
 * ./frp/frps -c ./frp/frps.toml
 * ./frp/frpc -c ./frp/frpc.toml
 */

import packageJson from './package.json';
import * as cmd from 'commander';
import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';

/** --- 网络请求 --- */
function post(url: string, data: Record<string, any>): Promise<Record<string, any> | null> {
    return new Promise(resolve => {
        // --- 解析URL以获取请求选项 ---
        const parsedUrl = new URL(url);
        const postData = JSON.stringify(data);
        /** --- 根据协议选择合适的模块 --- */
        const httpModule = parsedUrl.protocol === 'https:' ? https : http;
        /** --- 请求对象 --- */
        const req = httpModule.request({
            'hostname': parsedUrl.hostname,
            'port': parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            'path': parsedUrl.pathname + parsedUrl.search,
            'method': 'POST',
            'headers': {
                'content-type': 'application/json; charset=utf-8',
                'content-length': Buffer.byteLength(postData),
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36',
            },
            'timeout': 10_000,
        }, (response) => {
            let responseData = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                responseData += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                }
                catch {
                    resolve(null);
                }
            });
        }).on('error', () => {
            resolve(null);
        }).on('timeout', () => {
            resolve(null);
        });
        // --- 发送请求数据 ---
        req.write(postData);
        req.end();
    });
}

// --- 正式创建 ---

/** --- 配置文件数据 --- */
const configData: {
    'body': Record<string, any>;
    'last': number;
    'path': string;
} = {
    /** --- 配置文件内容 --- */
    'body': {},
    /** --- 最后一次读取 config 文件的时间，防止频繁读取 --- */
    'last': 0,
    /** --- 配置文件路径，仅初始化时使配置 --- */
    'path': '',
};

/** --- 获取配置文件 --- */
function getConfig():{
    "port"?: number;
    "users"?: Array<{
        "user": string;
        "token": string;
        "name"?: string[];
        "type"?: string[];
        "port"?: string[];
    }>,
    "server"?: {
        "url": string;
        "auth"?: string;
    }
} {
    const now = Date.now();
    if (now - configData.last > 5_000) {
        try {
            configData.body = JSON.parse(fs.readFileSync(configData.path, 'utf8'));
            configData.last = now;
        }
        catch {
            console.log('Read config file error');
            return {};
        }
    }
    return configData.body;
}

/** --- 获取POST请求体并解析为JSON --- */
function getPost(req: http.IncomingMessage): Promise<Record<string, any> | null> {
    return new Promise(resolve => {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', chunk => data += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(data));
            }
            catch {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
};

/**
 * --- 响应 ---
 * @param res 响应对象
 * @param code 响应状态码
 * @param data 响应数据
 */
function result(res: http.ServerResponse, code: number, data: Record<string, any>): void {
    const send = JSON.stringify(data);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.writeHead(code);
    res.end(send);
}

const program = new cmd.Command();

program
    .name('fp-multi')
    .description('Multi-user plugin for frp with per-user port limits and token/URL-based auth.')
    .version(packageJson.version, '-v, --version');

// --- 下载包 ---
program
    .option('-c, --config <path>', 'config file path')
    .action(async function() {
        const opts = program.opts();
        if (!opts.config) {
            console.log('Please specify the config file path.');
            return;
        }
        configData.path = opts.config;
        /** --- 配置文件 --- */
        const config = getConfig();
        // --- 启动 rpc server ---
        http.createServer(function(req: http.IncomingMessage, res: http.ServerResponse) {
            (async function() {
                const url = req.url ?? '/';
                const data = /op=([a-zA-Z0-9]+)/.exec(url);
                if (!data) {
                    result(res, 400, {
                        'reject': true,
                        'reject_reason': 'Invalid URL',
                    });
                    return;
                }
                /** --- 当前 op --- */
                const op = data[1];
                if (op !== 'Login' && op !== 'NewProxy') {
                    // --- 其他操作，不管 ---
                    result(res, 200, {
                        'reject': false,
                        'unchange': true,
                    });
                    return;
                }
                /** --- req 的 post 内容 --- */
                const _post = await getPost(req);
                if (!_post) {
                    result(res, 400, {
                        'reject': true,
                        'reject_reason': 'Invalid POST data',
                    });
                    return;
                }
                // --- 正式流程 ---
                /** --- 配置文件 --- */
                const config = getConfig();
                switch (op) {
                    case 'Login': {
                        // --- 登录 ---
                        if (config.users) {
                            // --- 那就先判断用户 ---
                            const user = config.users.find((item: Record<string, any>) => item.user === _post.content.user);
                            if (user) {
                                // --- 找到用户 ---
                                if (user.token === _post.content.metas.token) {
                                    // --- token 正确 ---
                                    result(res, 200, {
                                        'reject': false,
                                        'unchange': true,
                                    });
                                    // --- 提前结束 ---
                                    break;
                                }
                            }
                        }
                        // --- users 里没找到，那再找 server ---
                        if (!config.server?.url) {
                            result(res, 400, {
                                'reject': true,
                                'reject_reason': 'No server',
                            });
                            break;
                        }
                        const data = await post(config.server.url, {
                            'action': 'login',
                            'auth': config.server.auth,
                            'user': _post.content.user,
                            'token': _post.content.metas.token,
                        });
                        if (!data) {
                            result(res, 400, {
                                'reject': true,
                                'reject_reason': 'Server login failed',
                            });
                            break;
                        }
                        if (data.result <= 0) {
                            result(res, 400, {
                                'reject': true,
                                'reject_reason': 'Server login verify failed',
                            });
                            break;
                        }
                        // --- 登录成功 ---
                        result(res, 200, {
                            'reject': false,
                            'unchange': true,
                        });
                        break;
                    }
                    case 'NewProxy': {
                        // --- 新代理 ---
                        const proxyName = _post.content.proxy_name.slice(_post.content.user.user.length + 1);
                        if (config.users) {
                            // --- 那就先判断用户 ---
                            const user = config.users.find(item => item.user === _post.content.user.user);
                            if (user) {
                                // --- 找到用户 ---
                                if (user.token === _post.content.user.metas.token) {
                                    // --- token 正确，判断 name、type、port ---
                                    if (user.name?.length) {
                                        // --- 1. 代理名称 ---
                                        const isNameValid = user.name.some(rule => {
                                            if (rule.startsWith('/') && rule.endsWith('/')) {
                                                // --- 正则表达式规则 (格式例如: /^test-tcp-[0-9]+$/) ---
                                                const regex = new RegExp(rule.slice(1, -1));
                                                return regex.test(proxyName);
                                            }
                                            else {
                                                // --- 精确匹配规则 ---
                                                return proxyName === rule;
                                            }
                                        });
                                        if (!isNameValid) {
                                            // --- name 一个都不匹配，结束 ---
                                            result(res, 400, {
                                                'reject': true,
                                                'reject_reason': 'Invalid proxy name',
                                            });
                                            break;
                                        }
                                        // --- name 成功了，接着往下找 ---
                                    }
                                    if (user.type && user.type.length) {
                                        // --- 2. 验证代理类型 ---
                                        if (!user.type.includes(_post.content.proxy_type)) {
                                            // --- type 不匹配，结束 ---
                                            result(res, 400, {
                                                'reject': true,
                                                'reject_reason': 'Invalid proxy type',
                                            });
                                            break;
                                        }
                                        // --- type 成功了，接着往下找 ---
                                    }
                                    if (user.port && user.port.length) {
                                        // --- 3. 验证代理端口 ---
                                        const proxyPort = _post.content.remote_port;
                                        const isPortValid = user.port.some(rule => {
                                            if (rule.includes('-')) {
                                                // --- 端口范围 (格式: 5999-6001) ---
                                                const [start, end] = rule.split('-').map(Number);
                                                if (proxyPort >= start && proxyPort <= end) {
                                                    return true;
                                                }
                                            }
                                            else {
                                                // --- 单个端口 ---
                                                if (proxyPort === parseInt(rule, 10)) {
                                                    return true;
                                                }
                                            }
                                        });
                                        if (!isPortValid) {
                                            // --- port 一个都不匹配，结束 ---
                                            result(res, 400, {
                                                'reject': true,
                                                'reject_reason': 'Invalid proxy port',
                                            });
                                            break;
                                        }
                                    }
                                    // --- 所有验证通过 ---
                                    result(res, 200, {
                                        'reject': false,
                                        'unchange': true,
                                    });
                                    break;
                                }
                            }
                        }
                        // --- users 里没找到，那再找 server ---
                        if (!config.server?.url) {
                            result(res, 400, {
                                'reject': true,
                                'reject_reason': 'No server',
                            });
                            break;
                        }
                        const data = await post(config.server.url, {
                            'action': 'new',
                            'auth': config.server.auth,
                            'user': _post.content.user.user,
                            'token': _post.content.user.metas.token,
                            'name': proxyName,
                            'type': _post.content.proxy_type,
                            'port': _post.content.remote_port,
                        });
                        if (!data) {
                            result(res, 400, {
                                'reject': true,
                                'reject_reason': 'Server new proxy failed',
                            });
                            break;
                        }
                        if (data.result <= 0) {
                            result(res, 400, {
                                'reject': true,
                                'reject_reason': 'Server new proxy failed',
                            });
                            break;
                        }
                        // --- 登录成功 ---
                        result(res, 200, {
                            'reject': false,
                            'unchange': true,
                        });
                        break;
                    }
                }
            })().catch(function(e) {
                console.log('Rpc listener error', e);
            });
        }).listen(config.port ?? 7200, '127.0.0.1', () => {
            console.log('fp-multi server start at http://127.0.0.1:' + (config.port ?? 7200));
        });
    });

program.parse();
