import path from 'path'
import type { Configuration } from 'webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import ESLintPlugin from 'eslint-webpack-plugin'

const config: Configuration | Configuration[] = {
  mode: process.env.NODE_ENV as 'production' | 'development' | undefined || 'production',
  entry: './src/client/index.tsx',
  devtool: process.env.NODE_ENV == 'development' ? 'inline-source-map' : void 0,
  resolve: {
    extensions: ['.css', '.js', '.ts', '.jsx', '.tsx'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(import.meta.dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/i,
        exclude: /node_modules|\.d\.ts$/,
        use: 'ts-loader',
      },
      {
        test: /\.d\.ts$/,
        loader: 'ignore-loader',
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.mp3$/i,
        type: 'asset/resource',
      }
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ title: 'Freepaint' }),
    new ESLintPlugin,
  ],
}

export default config
