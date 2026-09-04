import * as Minio from "minio"
import config from "../config"

const client = new Minio.Client({
  endPoint: config.minio.endPoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
})

const BUCKET = config.minio.bucket

export async function initBucket(retries = 5): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const exists = await client.bucketExists(BUCKET)
      if (!exists) {
        await client.makeBucket(BUCKET)
        console.log(`Bucket "${BUCKET}" created`)
      } else {
        console.log(`Bucket "${BUCKET}" already exists`)
      }
      return
    } catch (err) {
      console.log(`MinIO not ready, retrying... (${i + 1}/${retries})`)
      await new Promise(r => setTimeout(r, 3000))  // 3 second wait
    }
  }
  throw new Error("MinIO connection failed after retries")
}

export async function putVersionObject(key: string, buffer: Buffer | string, mimetype: string) {
  const timeStamp = Date.now().toString()
  await putObject(key, buffer, mimetype)

  await putObject(`${key}.v.${timeStamp}`, buffer, mimetype);

  return timeStamp;
}


export async function putObject(
  key: string,
  buffer: Buffer | string,
  contentType: string
) {
  await client.putObject(BUCKET, key, buffer, buffer.length, {
    "Content-Type": contentType,
  })
}

export async function getObject(key: string): Promise<Buffer> {
  const stream = await client.getObject(BUCKET, key)
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (chunk) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

export async function deleteObject(key: string) {
  await client.removeObject(BUCKET, key)
}


export async function listObjects(): Promise<string[]> {

  const keys: string[] = []
  const stream = client.listObjects(BUCKET, "", true)
  return new Promise((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) keys.push(obj.name)
    })
    stream.on("end", () => resolve(keys))
    stream.on("error", (err) => {
      console.error("Error listing objects:", err)
      reject(err)
    })
  })
}