import axios from "axios"
import config from "./config"


export  const healthCheck: Record<string, boolean> = {
   
    IN: true,
    GB: true,
    US: true,
}



export function startHealthCheck() {
    setInterval(async () =>{
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