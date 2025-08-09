/**
 * Project: fp-multi, User: JianSuoQiYue
 * Date: 2025-8-1 11:15:09, 2025-8-9 17:17:21
 */

// npm publish --access public

/**
 * test:
 * node ./index -c ./demo-config.json
 * ./frp/frps -c ./frp/frps.toml
 * ./frp/frpc -c ./frp/frpc.toml
 */

import * as http from 'http';
import * as cmd from 'commander';
import packageJson from './package.json' with { 'type': 'json' };
import * as tool from './lib/tool.js';
import * as handle from './lib/handle.js';

const program = new cmd.Command();

program
    .name('fp-multi')
    .description('FRP Plugin: Multi-user support with configurable name, type, and port range restrictions. Supports token and URL authentication.')
    .version(packageJson.version, '-v, --version')

    // --- 正式业务 ---

    .option('-c, --config <path>', 'config file path')
    .action(async function() {
        const opts = program.opts();
        if (!opts.config) {
            console.log('Please specify the config file path.');
            return;
        }
        tool.configData.path = opts.config;
        /** --- 配置文件 --- */
        const config = tool.getConfig();
        // --- 启动 rpc server ---
        http.createServer(function(req: http.IncomingMessage, res: http.ServerResponse) {
            handle.accept(req, res)
        }).listen(config.port ?? 7200, '127.0.0.1', () => {
            console.log('fp-multi server start at http://127.0.0.1:' + (config.port ?? 7200));
        });
    });

program.parse();
