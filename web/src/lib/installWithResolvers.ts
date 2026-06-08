// iOS Safari < 17.4 (and some in-app WebViews) lack Promise.withResolvers, which pdfjs-dist v6
// calls in BOTH the main thread and its worker — without it, loading a PDF throws
// "undefined is not a function". This is a side-effect module: importing it installs the
// polyfill. It is imported FIRST (before any pdfjs code) in receiptOcr (main thread) and in
// pdfWorker (worker context), so ES-module import order guarantees it runs before pdf.js.

type Resolvers<T> = { promise: Promise<T>; resolve: (v: T | PromiseLike<T>) => void; reject: (r?: unknown) => void }
const P = Promise as unknown as { withResolvers?: <T>() => Resolvers<T> }

if (typeof P.withResolvers !== 'function') {
  P.withResolvers = function withResolvers<T>(): Resolvers<T> {
    let resolve!: (v: T | PromiseLike<T>) => void
    let reject!: (r?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
