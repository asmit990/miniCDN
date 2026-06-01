import dotenv from "dotenv"
dotenv.config()

const config = {
  port: process.env.PORT || 8080,
  regions: {
    IN: process.env.EDGE_IN || "http://edge-mumbai:8081",
    GB: process.env.EDGE_GB || "http://edge-london:8082",
    US: process.env.EDGE_US || "http://edge-nyc:8083",
  } as Record<string, string>,

  fallback: {
    IN: ["IN", "GB", "US"],
    GB: ["GB", "US", "IN"],
    US: ["US", "GB", "IN"],
  } as Record<string, string[]>,

  redis: {
    HOST: process.env.REDIS_HOST || "redis",
    PORT: parseInt(process.env.REDIS_PORT || "6379"),
  },
}

export default config
