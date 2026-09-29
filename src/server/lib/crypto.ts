import { randomBytes, randomInt, createHash } from "node:crypto";
import bcrypt from "bcryptjs";

// 32 random bytes = 256 bits of entropy, so the link can't be guessed. base64url is URL-safe.
export const generateToken = () => randomBytes(32).toString("base64url");

// We store only this hash. A database leak then doesn't reveal working links.
// A fast hash is fine because the token is already high-entropy.
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Access key: random, from an alphabet without look-alike characters (no 0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const generateAccessKey = (length = 10) =>
  Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// The key is short, so it gets a slow, salted hash (bcrypt). The library does the comparison.
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
