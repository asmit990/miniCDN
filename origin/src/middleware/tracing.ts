import { Request, Response, NextFunction } from "express"

/**
 * Origin-side tracing middleware.
 * - Reads X-Trace-ID from request headers
 * - Records start time
 * - On response finish, adds:
 *   - X-Origin-Timing: <duration>ms
 *   - X-Trace-ID: <trace-id> (echo back)
 */
export function originTracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers["x-trace-id"] as string) || ""
  const startTime = Date.now()

  if (traceId) {
    res.setHeader("X-Trace-ID", traceId)
  }

  const originalEnd = res.end.bind(res)
  res.end = function (...args: any[]) {
    const duration = Date.now() - startTime
    res.setHeader("X-Origin-Timing", `${duration.toFixed(1)}ms`)
    if (traceId) {
      res.setHeader("X-Trace-ID", traceId)
    }
    return originalEnd(...args)
  } as any

  next()
}
