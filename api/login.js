import jwt from "jsonwebtoken";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  const { username, password } = req.body;

  if (
    username !== process.env.ADMIN_USERNAME ||
    password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid username or password."
    });
  }

  const token = jwt.sign(
    {
      username
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "24h"
    }
  );

  res.setHeader(
    "Set-Cookie",
    `admin_token=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict; Secure`
  );

  return res.status(200).json({
    success: true
  });

}
