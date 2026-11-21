import axios from "axios"
import config from "./config"

export const healthCheck: Record<string, boolean> = {
  IN: true,
  GB: true,
  US: true,
}

let timer: NodeJS.Timeout | null = null

export function startHealthCheck() {
  if (timer) return
  timer = setInterval(async () => {
    for (const [region, url] of Object.entries(config.regions)) {
      try {
        await axios.get(`${url}/health`, { timeout: 2000 })
        healthCheck[region] = true
      } catch (error) {
        healthCheck[region] = false
      }
    }
  }, 5000)
}

export function stopHealthCheck() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
