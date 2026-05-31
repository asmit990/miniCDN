import dotenv from "dotenv"
import fs from "fs"
import yaml from "js-yaml"
dotenv.config()
const regionsFile = fs.readFileSync("../config/regions.yml", "utf8")
const regionsConfig = yaml.load(regionsFile) as any

const config = {
    port: process.env.PORT || 3000,
    regions: regionsConfig.regions as Record<string, string>,
    defaultRegion: regionsConfig.default_region as Record<string, string>,
    redis: {
       HOST: process.env.REDIS_HOST || "localhost",
       PORT: parseInt(process.env.REDIS_PORT || "6379"),

    }, 
    fallback: {
      IN: ["IN", "GB", "US"],
      US: ["US", "GB", "IN"],
      GB: ["GB", "US", "IN"]
    } as Record<string, string[]>,
}




export default config