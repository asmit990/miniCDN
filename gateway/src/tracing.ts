import { Request, Response, NextFunction } from "express"
import { randomUUID } from "crypto"

export interface TraceContext {
  traceId: string
  startTime: number
}

/**
 * Middleware that creates trace context and adds timing headers.
 * - Generates or reuses X-Trace-ID (falls back to X-Request-ID)
 * - Records start time
 * - On response finish, adds X-Gateway-Timing header
 */
export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const traceId =
    (req.headers["x-trace-id"] as string) ||
    (req.headers["x-request-id"] as string) ||
    randomUUID()

  const startTime = Date.now()

  // Attach trace context to the request for downstream use
  ;(req as any).traceContext = { traceId, startTime } as TraceContext

  // Set trace ID on the response immediately so it's always present
  res.setHeader("X-Trace-ID", traceId)
  // Keep X-Request-ID for backward compatibility
  res.setHeader("X-Request-ID", traceId)

  // On response finish, compute and add gateway timing
  res.on("finish", () => {
    const duration = Date.now() - startTime
    // Headers may already be sent, but setHeader before write is fine
    // We use the 'finish' event which fires after headers are written,
    // so we set the header before next() triggers the response instead.
  })

  // Set the timing header before the response is sent — we'll finalize in proxy
  // For non-proxy routes, add a default timing on finish
  const originalEnd = res.end.bind(res)
  res.end = function (...args: any[]) {
    const duration = Date.now() - startTime
    if (!res.getHeader("X-Gateway-Timing")) {
      res.setHeader("X-Gateway-Timing", `${duration}ms`)
    }
    return originalEnd(...args)
  } as any

  next()
}
