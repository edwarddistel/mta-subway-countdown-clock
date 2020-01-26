const nodeExternals = require('webpack-node-externals');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: './src/server.ts',
  output: {
    filename: './bundle.js',
  },
  mode: 'production',
  devtool: 'source-map',

  resolve: {
    extensions: ['webpack.js', '.web.js', '.ts', '.tsx', '.js'],
  },

  module: {
    rules: [{ test: /\.ts$/, loader: 'awesome-typescript-loader', exclude: /node_modules/ }],
  },
  plugins: [
    new Dotenv(),
  ],
  target: 'node',
  externals: [nodeExternals()],
};
