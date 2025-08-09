import * as https from 'https';
import * as fs from 'fs';
import * as http from 'http';

/** --- 网络请求 --- */
export function post(url: string, data: Record<string, any>): Promise<Record<string, any> | null> {
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
export const configData: {
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
export function getConfig():{
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
export function getPost(req: http.IncomingMessage): Promise<Record<string, any> | null> {
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
export function result(res: http.ServerResponse, code: number, data: Record<string, any>): void {
    const send = JSON.stringify(data);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.writeHead(code);
    res.end(send);
}