import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Derive a 32-byte encryption key from NEXTAUTH_SECRET.
 * Uses SHA-256 hash to normalize any length secret into a valid AES-256 key.
 */
function getKey() {
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) {
        throw new Error('NEXTAUTH_SECRET is not set — cannot encrypt/decrypt')
    }
    return crypto.createHash('sha256').update(secret).digest()
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * @param {string} text - The plaintext to encrypt
 * @returns {string} Encrypted string in format: iv:authTag:ciphertext (hex encoded)
 */
export function encrypt(text) {
    if (!text) return text

    const key = getKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag().toString('hex')

    return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypt an encrypted string produced by encrypt().
 * @param {string} encrypted - The encrypted string in format: iv:authTag:ciphertext
 * @returns {string} The original plaintext
 */
export function decrypt(encrypted) {
    if (!encrypted) return encrypted

    // If the value doesn't look encrypted (no colons), return as-is
    // This handles legacy plain-text values gracefully
    if (!encrypted.includes(':')) {
        return encrypted
    }

    const parts = encrypted.split(':')
    if (parts.length !== 3) {
        // Not in expected format, return as-is (legacy plain-text)
        return encrypted
    }

    try {
        const key = getKey()
        const [ivHex, authTagHex, ciphertext] = parts
        const iv = Buffer.from(ivHex, 'hex')
        const authTag = Buffer.from(authTagHex, 'hex')

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
        decipher.setAuthTag(authTag)

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
        decrypted += decipher.final('utf8')

        return decrypted
    } catch (err) {
        // Decryption failed — likely a legacy plain-text value
        console.warn('Decryption failed, treating as plain text:', err.message)
        return encrypted
    }
}
