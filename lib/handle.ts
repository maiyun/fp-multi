import * as http from 'http';
import * as tool from './tool.js';

/**
 * --- 接受请求 ---
 * @param req 请求对象
 * @param res 响应对象
 */
export async function accept(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = req.url ?? '/';
    const data = /op=([a-zA-Z0-9]+)/.exec(url);
    if (!data) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'Invalid URL',
        });
        return;
    }
    /** --- 当前 op --- */
    const op = data[1];
    if (op !== 'Login' && op !== 'NewProxy') {
        // --- 其他操作，不管 ---
        tool.result(res, 200, {
            'reject': false,
            'unchange': true,
        });
        return;
    }
    /** --- req 的 post 内容 --- */
    const reqPost = await tool.getPost(req);
    if (!reqPost) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'Invalid POST data',
        });
        return;
    }
    // --- 正式流程 ---
    switch (op) {
        case 'Login': {
            // --- 登录 ---
            await login(reqPost, res);
            break;
        }
        case 'NewProxy': {
            // --- 新代理 ---
            await newProxy(reqPost, res);
            break;
        }
    }
}

/**
 * --- 登录 ---
 * @param reqPost post 数据
 * @param res 响应对象
 */
export async function login(reqPost: Record<string, any>, res: http.ServerResponse): Promise<void> {
    const config = tool.getConfig();
    if (config.users) {
        // --- 那就先判断用户 ---
        const user = config.users.find((item: Record<string, any>) => item.user === reqPost.content.user);
        if (user) {
            // --- 找到用户 ---
            if (user.token === reqPost.content.metas.token) {
                // --- token 正确 ---
                tool.result(res, 200, {
                    'reject': false,
                    'unchange': true,
                });
                // --- 提前结束 ---
                return;
            }
        }
    }
    // --- users 里没找到，那再找 server ---
    if (!config.server?.url) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'No server',
        });
        return;
    }
    const data = await tool.post(config.server.url, {
        'action': 'login',
        'auth': config.server.auth,
        'user': reqPost.content.user,
        'token': reqPost.content.metas.token,
    });
    if (!data) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'Server login failed',
        });
        return;
    }
    if (data.result <= 0) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'Server login verify failed',
        });
        return;
    }
    // --- 登录成功 ---
    tool.result(res, 200, {
        'reject': false,
        'unchange': true,
    });
}

/**
 * --- 新建代理 ---
 * @param reqPost post 数据
 * @param res 响应对象
 */
export async function newProxy(reqPost: Record<string, any>, res: http.ServerResponse): Promise<void> {
    const config = tool.getConfig();
    const proxyName = reqPost.content.proxy_name.slice(reqPost.content.user.user.length + 1);
    if (config.users) {
        // --- 那就先判断用户 ---
        const user = config.users.find(item => item.user === reqPost.content.user.user);
        if (user) {
            // --- 找到用户 ---
            if (user.token === reqPost.content.user.metas.token) {
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
                        tool.result(res, 400, {
                            'reject': true,
                            'reject_reason': 'Invalid proxy name',
                        });
                        return;
                    }
                    // --- name 成功了，接着往下找 ---
                }
                if (user.type?.length) {
                    // --- 2. 验证代理类型 ---
                    if (!user.type.includes(reqPost.content.proxy_type)) {
                        // --- type 不匹配，结束 ---
                        tool.result(res, 400, {
                            'reject': true,
                            'reject_reason': 'Invalid proxy type',
                        });
                        return;
                    }
                    // --- type 成功了，接着往下找 ---
                }
                if (user.port?.length) {
                    // --- 3. 验证代理端口 ---
                    const proxyPort = reqPost.content.remote_port;
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
                        tool.result(res, 400, {
                            'reject': true,
                            'reject_reason': 'Invalid proxy port',
                        });
                        return;
                    }
                }
                // --- 所有验证通过 ---
                tool.result(res, 200, {
                    'reject': false,
                    'unchange': true,
                });
                return;
            }
        }
    }
    // --- users 里没找到，那再找 server ---
    if (!config.server?.url) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'No server',
        });
        return;
    }
    const data = await tool.post(config.server.url, {
        'action': 'new',
        'auth': config.server.auth,
        'user': reqPost.content.user.user,
        'token': reqPost.content.user.metas.token,
        'name': proxyName,
        'type': reqPost.content.proxy_type,
        'port': reqPost.content.remote_port,
    });
    if (!data) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'Server new proxy failed',
        });
        return;
    }
    if (data.result <= 0) {
        tool.result(res, 400, {
            'reject': true,
            'reject_reason': 'Server new proxy failed',
        });
        return;
    }
    // --- 登录成功 ---
    tool.result(res, 200, {
        'reject': false,
        'unchange': true,
    });
}
