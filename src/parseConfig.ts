const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

type WsConnection = {
    mode: 'ws';
    authentication: string;
} & (
    | { type: 'active'; target: string }
    | { type: 'passive'; host: string; port: number }
);

const parseWsConnection = (
    data: Record<string, unknown>
): WsConnection | undefined => {
    const { authentication, type } = data;
    if (
        typeof authentication !== 'string' ||
        authentication.length !== 64 ||
        typeof type !== 'string' ||
        !['active', 'passive'].includes(type) ||
        (type === 'active' &&
            (Object.keys(data).length !== 4 ||
                typeof data['target'] !== 'string')) ||
        (type === 'passive' &&
            (Object.keys(data).length !== 5 ||
                typeof data['host'] !== 'string' ||
                typeof data['port'] !== 'number'))
    ) {
        return undefined;
    }

    return {
        mode: data.mode,
        authentication,
        type,
        ...(type === 'active'
            ? { target: data['target'] }
            : { host: data['host'], port: data['port'] })
    } as WsConnection;
};

type SocksConnection = {
    mode: 'socks';
    host: string;
    port: number;
    authentication: { username: string; password: string } | 'none';
};

const parseSocksConnection = (
    data: Record<string, unknown>
): SocksConnection | undefined => {
    const { host, port, authentication } = data;
    if (
        Object.keys(data).length !== 4 ||
        typeof host !== 'string' ||
        typeof port !== 'number'
    ) {
        return undefined;
    }

    if (authentication === 'none') {
        return { mode: 'socks', host, port, authentication };
    }
    if (!isObject(authentication) || Object.keys(authentication).length !== 2) {
        return undefined;
    }

    const { username, password } = authentication;
    if (typeof username !== 'string' || typeof password !== 'string') {
        return undefined;
    }

    return {
        mode: 'socks',
        host,
        port,
        authentication: { username, password }
    };
};

type InternetConnection = {
    mode: 'internet';
};

type Config = {
    input: SocksConnection | WsConnection;
    output: InternetConnection | WsConnection;
};

const parseInput = (data: unknown): Config['input'] | undefined => {
    if (
        !isObject(data) ||
        typeof data['mode'] !== 'string' ||
        !['socks', 'ws'].includes(data['mode'])
    ) {
        return undefined;
    }
    switch (data['mode'] as 'socks' | 'ws') {
        case 'socks':
            return parseSocksConnection(data);
        case 'ws':
            return parseWsConnection(data);
    }
};

const parseOutput = (data: unknown): Config['output'] | undefined => {
    if (
        !isObject(data) ||
        typeof data['mode'] !== 'string' ||
        !['internet', 'ws'].includes(data['mode'])
    ) {
        return undefined;
    }
    switch (data['mode'] as 'internet' | 'ws') {
        case 'internet':
            return { mode: 'internet' };
        case 'ws':
            return parseWsConnection(data);
    }
};

const parseConfig = (data: unknown): Config | undefined => {
    if (!isObject(data) || Object.keys(data).length !== 2) {
        return undefined;
    }
    const { input, output } = data;

    const parsedInput = parseInput(input);
    if (parsedInput === undefined) {
        return undefined;
    }

    const parsedOutput = parseOutput(output);
    if (parsedOutput === undefined) {
        return undefined;
    }

    return { input: parsedInput, output: parsedOutput };
};

export {
    type WsConnection,
    type SocksConnection,
    type InternetConnection,
    type Config,
    isObject,
    parseWsConnection,
    parseSocksConnection,
    parseInput,
    parseOutput,
    parseConfig
};
