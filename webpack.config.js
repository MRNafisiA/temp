module.exports = {
    entry: './dist/index.js',
    mode: 'production',
    target: 'node',
    output: {
        path: `${__dirname}/build`,
        filename: 'index.js'
    },
    optimization: {
        minimize: true,
        nodeEnv: 'production'
    }
};
