import crypto from 'crypto';

const keyB64 = process.env.FILE_ENCRYPTION_KEY ?? '';
if (keyB64.length === 0) {
	console.warn('[crypto] FILE_ENCRYPTION_KEY not set. Set a 32-byte base64 key.');
}
const key = keyB64 ? Buffer.from(keyB64, 'base64') : crypto.randomBytes(32);

export function encryptBuffer(plain: Buffer) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
	const tag = cipher.getAuthTag();
	return { iv, tag, encrypted };
}

export function decryptBuffer(encrypted: Buffer, iv: Buffer, tag: Buffer) {
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]);
} 