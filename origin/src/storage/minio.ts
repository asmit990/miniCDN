import *  as Minio from "minio"
import config from "../config"


const client = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

const BUSKET = config.minio.bucket

export async function initBusket() {
    const exists = await client.bucketExists(BUSKET)
    if(!exists) {
        await client.makeBucket(BUSKET)
        console.log(`Busket ${BUSKET} created`)

    }
}


export async function putObject( key: string,
  buffer: Buffer,
  contentType: string) {
      await client.putObject(BUSKET, key, buffer, buffer.length, {
    "Content-Type": contentType,
  })
}


export async function getObject(key: string): Promise<Buffer> {
    const stream = await client.getObject(BUSKET, key)
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [] 
        stream.on("data", (chunk) => {
            chunks.push(chunk)
        })

        stream.on('end', () => {
            resolve(Buffer.concat(chunks))
        })

        stream.on("error", reject)
    })
}



export async function deleteObject(key: string) {
  await client.removeObject(BUSKET, key)
}