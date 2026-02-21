import http from 'http';
import { WsConnection } from './parseConfig';
import { WebSocketServer, WebSocket } from 'ws';
import { Socks5Server } from '@pondwader/socks5-server';

type DateAndAuthentication =
    | Data
    | { type: 'auth-req'; value: string }
    | { type: 'auth-res'; value: boolean };

type Data =
    | {
          type: 'req-start';
          id: number;
          value: [host: string, port: number];
      }
    | { type: 'req-data'; id: number; value: Buffer }
    | { type: 'req-end'; id: number; value: undefined }
    | {
          type: 'status';
          id: number;
          value: Parameters<
              Parameters<Socks5Server['connectionHandler']>[1]
          >[0];
      };

class SmartWsConnection {
    private isConnected = false;
    private isAuthenticated = false;
    private ws: WebSocket | undefined;
    private wss: WebSocketServer | undefined;
    private config: WsConnection;
    private onMessage: (data: Data) => void;

    constructor(config: WsConnection, onMessage: (data: Data) => void) {
        this.config = config;
        this.onMessage = onMessage;
        switch (config.type) {
            case 'active':
                this.reNewWs(config.target);
                break;
            case 'passive':
                const server = http.createServer((_, res) => {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end('WebSocket server is running');
                });
                this.wss = new WebSocket.Server({ server });
                this.wss.on('connection', ws => {
                    if (this.isConnected) {
                        ws.close();
                        return;
                    }
                    this.ws = ws;
                    this.prepareWs();
                });
                server.listen(Number(process.env.PORT), config.host);
                break;
        }
    }

    private reNewWs(target: string) {
        this.ws = new WebSocket(target);
        this.isAuthenticated = false;
        this.ws.on('open', () => {
            this.ws!.send(
                JSON.stringify({
                    type: 'auth-req',
                    value: this.config.authentication
                })
            );
        });
        this.ws!.on('message', data => {
            const parsedData = JSON.parse(
                data.toString()
            ) as DateAndAuthentication;
            switch (parsedData.type) {
                case 'auth-req':
                    throw 'unexpected!';
                case 'auth-res':
                    if (parsedData.value && !this.isAuthenticated) {
                        this.isAuthenticated = true;
                    } else {
                        this.ws!.close();
                    }
                    return;

                default:
                    if (!this.isAuthenticated) {
                        this.ws!.close();
                        return;
                    }
                    this.onMessage(parsedData);
            }
        });
        this.ws.on('close', () => {
            setTimeout(() => {
                this.reNewWs(target);
            }, 5000);
        });
    }

    private prepareWs() {
        this.isConnected = true;

        this.ws!.on('message', data => {
            const parsedData = JSON.parse(
                data.toString()
            ) as DateAndAuthentication;
            switch (parsedData.type) {
                case 'auth-req':
                    this.ws!.send(
                        JSON.stringify({
                            type: 'auth-res',
                            value:
                                parsedData.value === this.config.authentication
                        })
                    );
                    if (parsedData.value === this.config.authentication) {
                        this.isAuthenticated = true;
                    } else {
                        this.ws!.close();
                    }
                    return;
                case 'auth-res':
                    throw 'unexpected!';
                default:
                    if (!this.isAuthenticated) {
                        this.ws!.close();
                        return;
                    }
                    this.onMessage(parsedData);
            }
        });

        this.ws!.on('close', () => {
            this.ws = undefined;
            this.isAuthenticated = false;
            this.isConnected = false;
        });
    }

    send(data: Data) {
        if (this.ws === undefined || this.ws.readyState !== WebSocket.OPEN) {
            setTimeout(() => {
                this.send(data);
            }, 100);
            return;
        }
        this.ws.send(JSON.stringify(data));
    }
}

export { type Data, SmartWsConnection };
