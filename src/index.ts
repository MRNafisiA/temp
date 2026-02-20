import net from 'net';
import { Duplex } from 'stream';
import { readFileSync } from 'fs';
import { Config, parseConfig } from './parseConfig';
import { Data, SmartWsConnection } from './SmartWebSocket';
import {
    createServer as createSocksServer,
    Socks5Server
} from '@pondwader/socks5-server';

const getConfig = (): Config => {
    let rawConfig;
    if (process.argv.length === 4) {
        switch (process.argv[2]) {
            case '--config':
                rawConfig = readFileSync(process.argv[3], 'utf8');
                break;
            case '--env':
                rawConfig = process.env[process.argv[3]]!;
                break;
            default:
                throw 'invalid params.\nhelp: bun index.js [--config <CONFIG ADDRESS>] [--evn <ENVIRONMENT VARIABLE NAME>]';
        }
        const config = parseConfig(JSON.parse(rawConfig));
        if (config === undefined) {
            throw 'invalid config!';
        }
        return config;
    }
    throw 'invalid params.\nhelp: bun index.js [--config <CONFIG ADDRESS>] [--evn <ENVIRONMENT VARIABLE NAME>]';
};

const config = getConfig();
const socksSocketMap: Record<
    number,
    {
        socket: Duplex;
        sendStatus: (
            status: Parameters<
                Parameters<Socks5Server['connectionHandler']>[1]
            >[0]
        ) => void;
    }
> = {};
const netSocketMap: Record<number, net.Socket> = {};
let idCounter = 0;
let incomingWs: SmartWsConnection | undefined;
let outcomingWs: SmartWsConnection | undefined;

const sendBackward = (data: Data) => {
    switch (config.input.mode) {
        case 'socks':
            switch (data.type) {
                case 'req-start':
                case 'req-end':
                    throw 'unexpected!';
                case 'req-data':
                    socksSocketMap[data.id].socket.write(
                        Buffer.from(data.value)
                    );
                    break;
                case 'status':
                    socksSocketMap[data.id].sendStatus(data.value);
                    break;
            }
            break;
        case 'ws':
            incomingWs!.send(data);
            break;
    }
};
const sendForward = (data: Data) => {
    switch (config.output.mode) {
        case 'internet': {
            switch (data.type) {
                case 'req-start': {
                    const [host, port] = data.value;
                    const stream = net.createConnection({
                        host,
                        port
                    });
                    stream.setNoDelay();

                    let streamOpened = false;
                    stream.on('error', (err: Error & { code: string }) => {
                        if (!streamOpened) {
                            switch (err.code) {
                                case 'EINVAL':
                                case 'ENOENT':
                                case 'ENOTFOUND':
                                case 'ETIMEDOUT':
                                case 'EADDRNOTAVAIL':
                                case 'EHOSTUNREACH':
                                    sendBackward({
                                        type: 'status',
                                        id: data.id,
                                        value: 'HOST_UNREACHABLE'
                                    });
                                    break;
                                case 'ENETUNREACH':
                                    sendBackward({
                                        type: 'status',
                                        id: data.id,
                                        value: 'NETWORK_UNREACHABLE'
                                    });
                                    break;
                                case 'ECONNREFUSED':
                                    sendBackward({
                                        type: 'status',
                                        id: data.id,
                                        value: 'CONNECTION_REFUSED'
                                    });
                                    break;
                                default:
                                    sendBackward({
                                        type: 'status',
                                        id: data.id,
                                        value: 'GENERAL_FAILURE'
                                    });
                                    break;
                            }
                        }
                    });

                    stream.on('ready', () => {
                        streamOpened = true;
                    });

                    stream.on('data', chunk => {
                        sendBackward({
                            type: 'req-data',
                            id: data.id,
                            value: chunk
                        });
                    });

                    netSocketMap[data.id] = stream;
                    break;
                }
                case 'req-data': {
                    netSocketMap[data.id].write(Buffer.from(data.value));
                    break;
                }
                case 'req-end': {
                    netSocketMap[data.id].destroy();
                    delete netSocketMap[data.id];
                    break;
                }
                case 'status':
                    break;
            }

            break;
        }
        case 'ws': {
            outcomingWs!.send(data);
            break;
        }
    }
};

switch (config.input.mode) {
    case 'socks': {
        const socksServer = createSocksServer({
            hostname: config.input.host,
            port: config.input.port,
            ...(config.input.authentication !== 'none'
                ? { auth: config.input.authentication }
                : {})
        });
        socksServer.setConnectionHandler((connection, sendStatus) => {
            if (connection.command !== 'connect') {
                return sendStatus('COMMAND_NOT_SUPPORTED');
            }
            connection.socket.on('error', () => {});

            const id = idCounter++;
            socksSocketMap[id] = { socket: connection.socket, sendStatus };

            connection.socket.on('data', value => {
                sendForward({ type: 'req-data', id, value });
            });
            connection.socket.on('close', () => {
                sendForward({ type: 'req-end', id, value: undefined });
                delete socksSocketMap[id];
            });

            sendForward({
                type: 'req-start',
                id,
                value: [connection.destAddress, connection.destPort]
            });
            sendStatus('REQUEST_GRANTED');
        });
        break;
    }
    case 'ws': {
        incomingWs = new SmartWsConnection(config.input, data => {
            sendForward(data);
        });
        break;
    }
}
switch (config.output.mode) {
    case 'internet':
        break;
    case 'ws':
        outcomingWs = new SmartWsConnection(config.output, data => {
            sendBackward(data);
        });
        break;
}

