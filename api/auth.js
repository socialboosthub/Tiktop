import jwt from "jsonwebtoken";

export default function handler(req, res) {

  const cookie = req.headers.cookie || "";

  const token = cookie
    .split("; ")
    .find(c => c.startsWith("admin_token="))
    ?.split("=")[1];

  if (!token) {
    return res.status(401).json({
      authenticated: false
    });
  }

  try {

    jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    return res.json({
      authenticated: true
    });

  } catch {

    return res.status(401).json({
      authenticated: false
    });

  }

}
