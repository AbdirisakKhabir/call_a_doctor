import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET_KEY || "your-secret-key-change-in-production";

export type JWTPayload = {
  userId: number;
  email: string;
  roleId: number;
  iat?: number;
  exp?: number;
};

export function signToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  return jwt.sign(payload, SECRET, { expiresIn: "6h" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, SECRET) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}
