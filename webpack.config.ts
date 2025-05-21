import path from 'path'
import type { Configuration } from 'webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'

const config: Configuration = {
  mode: 'production',
  entry: './src/client/index.tsx',
  resolve: {
    extensions: ['.css', '.js', '.ts', '.jsx', '.tsx'],
  },
  output: {
    filename: 'index.js',
    path: path.resolve(import.meta.dirname, 'public'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/i,
        exclude: /node_modules/,
        use: 'ts-loader',
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
  plugins: [new HtmlWebpackPlugin({ title: 'Freepaint' })],
}

export default config
