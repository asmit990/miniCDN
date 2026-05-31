import dotenv from "dotenv"
dotenv.config()


const config = {
    port: process.env.PORT || 3000,

    redis: {
       HOST: process.env.REDIS_HOST || "localhost",
       PORT: parseInt(process.env.REDIS_PORT || "6379"),

    }, 
    regions: {
        IN: process.env.IN_REGION || "http://localhost:8081",
        US: process.env.US_REGION || "http://localhost:8082", 
        GB: process.env.GB_REGION || "http://localhost:8083"
    } as Record<string, string>,


    fallback: {
      IN: ["IN", "GB", "US"],
      US: ["US", "GB", "IN"],
      GB: ["GB", "US", "IN"]
    } as Record<string, string[]>,
}




export default config