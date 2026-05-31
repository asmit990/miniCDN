import config from "./config"
import { healthCheck} from "./healthcheck"










export function pickEdge(region: string): string | null {
    const order = config.fallback[region] || config.fallback["IN"]


    for (const r of order) {
        if(healthCheck[r]) {
            return config.regions[r]
        }
    }
    return null
}





export function detectRegion(req: any): string {
    // for testing , we will use geoIP in production
    const region  = req.headers['x-region']?.toUpperCase()


    if(region && config.regions[region]) {
        return region
    }
    
    return "IN" // default region mumbai for the sake of nearness
}

