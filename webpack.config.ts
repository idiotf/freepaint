import path from 'path'
import type { Configuration } from 'webpack'
import CopyPlugin from 'copy-webpack-plugin'
import HtmlWebpackPlugin from 'html-webpack-plugin'

const config: Configuration | Configuration[] = {
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
  plugins: [
    new HtmlWebpackPlugin({ title: 'Freepaint' }),
    new CopyPlugin({
      patterns: [
        { from: 'src/favicon.ico', to: 'favicon.ico' },
        { from: 'src/manifest.json', to: 'manifest.json' },
      ],
    }),
  ],
}

export default config
