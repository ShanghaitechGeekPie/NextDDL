import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(){
    const secret = process.env.PLATFORM_SESSION_SECRET
    if (!secret){
        throw new Error('Missing PLATFORM_SESSION_SECRET')
    }
    return createHash('sha256').update(secret).digest();
}

export const __cryptoModule = true;

export function encryptJson(value: unknown){
    const key = getKey()
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()
    const ivB64 = iv.toString('base64')
    const tagB64 = tag.toString('base64')
    const dataB64 = ciphertext.toString('base64')
    return `${ivB64}.${tagB64}.${dataB64}`
}

export function decryptJson<T>(payload: string): T {
    const [ivB64, tagB64, dataB64] = payload.split('.')
    if (!ivB64 || !tagB64 || !dataB64) {
        throw new Error('Invalid payload format')
    }
    const key = getKey()
    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const data = Buffer.from(dataB64, 'base64')
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
    return JSON.parse(plaintext.toString('utf8')) as T
}