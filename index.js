"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const package_json_1 = __importDefault(require("./package.json"));
const cmd = __importStar(require("commander"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const fs = __importStar(require("fs"));
function post(url, data) {
    return new Promise(resolve => {
        const parsedUrl = new URL(url);
        const postData = JSON.stringify(data);
        const httpModule = parsedUrl.protocol === 'https:' ? https : http;
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
        req.write(postData);
        req.end();
    });
}
const configData = {
    'body': {},
    'last': 0,
    'path': '',
};
function getConfig() {
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
function getPost(req) {
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
}
;
function result(res, code, data) {
    const send = JSON.stringify(data);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.writeHead(code);
    res.end(send);
}
const program = new cmd.Command();
program
    .name('fp-multi')
    .description('Multi-user plugin for frp with per-user port limits and token/URL-based auth.')
    .version(package_json_1.default.version, '-v, --version');
program
    .option('-c, --config <path>', 'config file path')
    .action(async function () {
    const opts = program.opts();
    if (!opts.config) {
        console.log('Please specify the config file path.');
        return;
    }
    configData.path = opts.config;
    const config = getConfig();
    http.createServer(function (req, res) {
        (async function () {
            const url = req.url ?? '/';
            const data = /op=([a-zA-Z0-9]+)/.exec(url);
            if (!data) {
                result(res, 400, {
                    'reject': true,
                    'reject_reason': 'Invalid URL',
                });
                return;
            }
            const op = data[1];
            if (op !== 'Login' && op !== 'NewProxy') {
                result(res, 200, {
                    'reject': false,
                    'unchange': true,
                });
                return;
            }
            const _post = await getPost(req);
            if (!_post) {
                result(res, 400, {
                    'reject': true,
                    'reject_reason': 'Invalid POST data',
                });
                return;
            }
            const config = getConfig();
            switch (op) {
                case 'Login': {
                    if (config.users) {
                        const user = config.users.find((item) => item.user === _post.content.user);
                        if (user) {
                            if (user.token === _post.content.metas.token) {
                                result(res, 200, {
                                    'reject': false,
                                    'unchange': true,
                                });
                                break;
                            }
                        }
                    }
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
                    result(res, 200, {
                        'reject': false,
                        'unchange': true,
                    });
                    break;
                }
                case 'NewProxy': {
                    const proxyName = _post.content.proxy_name.slice(_post.content.user.user.length + 1);
                    if (config.users) {
                        const user = config.users.find(item => item.user === _post.content.user.user);
                        if (user) {
                            if (user.token === _post.content.user.metas.token) {
                                if (user.name?.length) {
                                    const isNameValid = user.name.some(rule => {
                                        if (rule.startsWith('/') && rule.endsWith('/')) {
                                            const regex = new RegExp(rule.slice(1, -1));
                                            return regex.test(proxyName);
                                        }
                                        else {
                                            return proxyName === rule;
                                        }
                                    });
                                    if (!isNameValid) {
                                        result(res, 400, {
                                            'reject': true,
                                            'reject_reason': 'Invalid proxy name',
                                        });
                                        break;
                                    }
                                }
                                if (user.type && user.type.length) {
                                    if (!user.type.includes(_post.content.proxy_type)) {
                                        result(res, 400, {
                                            'reject': true,
                                            'reject_reason': 'Invalid proxy type',
                                        });
                                        break;
                                    }
                                }
                                if (user.port && user.port.length) {
                                    const proxyPort = _post.content.remote_port;
                                    const isPortValid = user.port.some(rule => {
                                        if (rule.includes('-')) {
                                            const [start, end] = rule.split('-').map(Number);
                                            if (proxyPort >= start && proxyPort <= end) {
                                                return true;
                                            }
                                        }
                                        else {
                                            if (proxyPort === parseInt(rule, 10)) {
                                                return true;
                                            }
                                        }
                                    });
                                    if (!isPortValid) {
                                        result(res, 400, {
                                            'reject': true,
                                            'reject_reason': 'Invalid proxy port',
                                        });
                                        break;
                                    }
                                }
                                result(res, 200, {
                                    'reject': false,
                                    'unchange': true,
                                });
                                break;
                            }
                        }
                    }
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
                    result(res, 200, {
                        'reject': false,
                        'unchange': true,
                    });
                    break;
                }
            }
        })().catch(function (e) {
            console.log('Rpc listener error', e);
        });
    }).listen(config.port ?? 7200, '127.0.0.1', () => {
        console.log('fp-multi server start at http://127.0.0.1:' + (config.port ?? 7200));
    });
});
program.parse();
