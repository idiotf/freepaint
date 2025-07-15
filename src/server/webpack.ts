// Bun은 CJS를 ESM으로 가져올 때 동적으로 설정된 게터를 호출하므로, Webpack 임포트 시 Deprecation 경고가 나타난다.
// 이를 피하기 위해, CJS로 바로 임포트한 뒤 ESM으로 다시 내보낸다.

// eslint-disable-next-line @typescript-eslint/no-require-imports
export default require('webpack')
