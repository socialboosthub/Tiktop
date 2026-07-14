require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { Resend } = require("resend");
const axios = require("axios");
const fetch = require("node-fetch"); // Ensure you are using node-fetch@2 for require() support

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// ==========================================
// 1. MONGODB SERVERLESS CONNECTION CACHE
// ==========================================
let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(process.env.MONGO_URI);
    isConnected = db.connections[0].readyState;
    console.log("MongoDB Hook Connection Established (Serverless)");
  } catch (err) {
    console.error("Database configuration missing or invalid:", err);
  }
};

// Database Schema
const SupportSchema = new mongoose.Schema({
  email: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ["one-time", "monthly"], required: true },
  gateway: { type: String, default: "paypal" },
  status: { type: String, default: "completed" },
  referenceId: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
});
const Support = mongoose.model("Support", SupportSchema);

// ==========================================
// 2. MAILER & PAYPAL OAUTH SETUP
// ==========================================


async function sendThankYouEmail(userEmail, amount, type) {
  try {
    await resend.emails.send({
      from: "TikTop <support@tiktop.online>",
      to: userEmail,
      subject:
        type === "monthly"
          ? "Welcome to TikTop Membership ❤️"
          : "Thank you for supporting TikTop ❤️",

      html: `
      <div style="font-family:Arial;padding:30px;background:#050515;color:white">
        <h2 style="color:#25F4EE">Thank You!</h2>

        <p>
        ${
          type === "monthly"
            ? `Thank you for becoming a TikTop monthly member.`
            : `Thank you for donating <b>$${amount}</b> to TikTop.`
        }
        </p>

        <p>Your support keeps TikTop fast, free and ad-light.</p>

        <hr>

        <p style="font-size:12px;color:#999">
        TikTop.online
        </p>
      </div>
      `,
    });

    console.log("Email sent.");
  } catch (err) {
    console.error(err);
  }
}

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const response = await axios({
    url: `${process.env.PAYPAL_API_URL}/v1/oauth2/token`,
    method: "post",
    data: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  return response.data.access_token;
}

// ==========================================
// 3. MIDDLEWARE (ORDER IS CRITICAL)
// ==========================================
// Webhook needs raw body before express.json() intercepts it
app.use("/api/webhooks/paypal", express.raw({ type: "application/json" }));

// Standard JSON parser for all other routes
app.use(express.json());

// CORS configuration (Allows frontend to talk to this API)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ==========================================
// 4. PAYPAL SUPPORT ROUTES
// ==========================================
app.post("/api/create-paypal-subscription-plan", async (req, res) => {
  await connectDB(); // Ensure DB is connected in serverless
  const { amount } = req.body;
  try {
    const token = await getPayPalAccessToken();

    const planPayload = {
      product_id: process.env.PAYPAL_PRODUCT_ID,
      name: `TikTop Custom Membership - Tier $${amount}`,
      description: `Bespoke configuration member recurring support for TikTop operations`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: amount.toString(), currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 2,
      },
    };

    const response = await axios.post(`${process.env.PAYPAL_API_URL}/v1/billing/plans`, planPayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    res.json({ id: response.data.id });
  } catch (err) {
    console.error("PayPal Runtime Plan Generation Failure:", err.response?.data || err.message);
    res.status(500).json({ error: "Bespoke dynamic plan construction aborted on server runtime." });
  }
});

app.post("/api/webhooks/paypal", async (req, res) => {
  await connectDB(); // Ensure DB is connected in serverless
  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).send("Webhook body parsing exception.");
  }

  // One-Time Donation
  if (event.event_type === "PAYMENT.SALE.COMPLETED") {
    const sale = event.resource;
    const customFormEmail = sale.custom_id || (sale.billing_agreement_id ? null : "donor@tiktop.online");

    if (customFormEmail && !sale.billing_agreement_id) {
      try {
        await Support.findOneAndUpdate(
          { referenceId: sale.id },
          {
            email: customFormEmail,
            amount: parseFloat(sale.amount.total),
            type: "one-time",
            referenceId: sale.id,
            status: "completed",
          },
          { upsert: true, new: true }
        );
        await sendThankYouEmail(customFormEmail, sale.amount.total, "one-time");
      } catch (dbErr) {
        console.error("Database write exception parsing transaction:", dbErr.message);
      }
    }
  }
  // Monthly Subscription
  else if (event.event_type === "BILLING.SUBSCRIPTION.ACTIVATED") {
    const subscription = event.resource;
    const customFormEmail = subscription.custom_id || subscription.subscriber.email_address;
    const totalValueAmount = subscription.billing_info?.last_payment?.amount?.value || "10.00";

    try {
      await Support.findOneAndUpdate(
        { referenceId: subscription.id },
        {
          email: customFormEmail,
          amount: parseFloat(totalValueAmount),
          type: "monthly",
          referenceId: subscription.id,
          status: "completed",
        },
        { upsert: true, new: true }
      );
      await sendThankYouEmail(customFormEmail, totalValueAmount, "monthly");
    } catch (dbErr) {
      console.error("Database write exception tracking active membership:", dbErr.message);
    }
  }

  res.sendStatus(200);
});
app.post("/api/donation-success", async (req, res) => {
  await connectDB();

  try {
    const { email, amount, mode, orderId } = req.body;

    if (!email || !amount || !orderId) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    await Support.findOneAndUpdate(
      { referenceId: orderId },
      {
        email,
        amount: Number(amount),
        type: mode === "monthly" ? "monthly" : "one-time",
        gateway: "paypal",
        status: "completed",
        referenceId: orderId
      },
      {
        upsert: true,
        new: true
      }
    );

    await sendThankYouEmail(
      email,
      amount,
      mode === "monthly" ? "monthly" : "one-time"
    );

    res.json({
      success: true
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});
// ==========================================
// 5. TIKTOK MEDIA DOWNLOAD ROUTES
// ==========================================
app.get("/api", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)",
      },
    });

    const json = await response.json();
    res.json(json);
  } catch {
    res.status(500).json({ error: "API failed" });
  }
});

app.get("/mp3", async (req, res) => {
  try {
    const response = await fetch(req.query.url);
    const id = req.query.id || Math.floor(Math.random() * 100000);
    const fileName = `tiktop-${id}.mp3`;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.body.pipe(res);
  } catch {
    res.status(500).send("Audio download failed");
  }
});

app.get("/download", async (req, res) => {
  try {
    const response = await fetch(req.query.url);
    const id = req.query.id || "video";
    
    let fileName = req.query.hd === "1" ? `tiktop-${id}_hd.mp4` : `tiktop-${id}.mp4`;

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.body.pipe(res);
  } catch {
    res.status(500).send("Download failed");
  }
});

app.get("/image", async (req, res) => {
  try {
    const response = await fetch(req.query.url);
    const id = req.query.id || "image";
    const index = req.query.index ? `-img-${req.query.index}` : "";
    const fileName = `tiktop-${id}${index}.jpeg`;

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.body.pipe(res);
  } catch {
    res.status(500).send("Image download failed");
  }
});


app.get("/api/profile", async (req, res) => {
  const username = (req.query.username || "").replace("@", "").trim();

  // Safety fallback
  const defaultResponse = {
    user: {
      username: username || "User",
      avatar: "https://www.tiktok.com/favicon.ico", 
      followers: "0",
      following: "0",
      likes: "0"
    },
    videos: []
  };

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    // 1. The original TikWM URL we want to hit
    const targetUrl = `https://tikwm.com/api/user/posts?unique_id=${encodeURIComponent(username)}&count=30&cursor=0`;
    
    // 2. Fetch your ScraperAPI key from environment variables
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY; 

    if (!SCRAPER_API_KEY) {
      console.error("Missing SCRAPER_API_KEY in .env");
      return res.status(500).json({ error: "Proxy configuration missing" });
    }
    
    // 3. Construct the proxy URL
    // We send the target URL through ScraperAPI. 
    const apiUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}`;
    
    const response = await fetch(apiUrl);
    const textResponse = await response.text();
    let json;

    try {
      json = JSON.parse(textResponse);
    } catch (parseErr) {
      // If we still get blocked (unlikely with ScraperAPI), log it
      console.error("Proxy did not return JSON. Raw response:", textResponse.substring(0, 200));
      return res.status(500).json({ error: "Upstream proxy blocked request" });
    }

    console.log(`ScraperAPI Response for ${username}:`, JSON.stringify({ code: json.code, msg: json.msg }));

    // 4. Map the data if successful
    if (json.code === 0 && json.data) {
      const remoteVideos = json.data.videos || json.data.list || [];
      
      if (remoteVideos.length > 0) {
        const authorInfo = remoteVideos[0].author || {};
        
        defaultResponse.user = {
          username: authorInfo.unique_id || username,
          avatar: authorInfo.avatar || "",
          followers: authorInfo.follower_count || "0",
          following: authorInfo.following_count || "0",
          likes: authorInfo.heart_count || authorInfo.total_favorited || "0"
        };

        defaultResponse.videos = remoteVideos.map(v => ({
          id: v.video_id || v.id,
          caption: v.title || v.desc || "TikTok Video",
          cover: v.cover || v.origin_cover,
          play: `https://www.tiktok.com/@${authorInfo.unique_id || username}/video/${v.video_id || v.id}`
        }));

        return res.json(defaultResponse);
      }
    } else {
      return res.status(502).json({ error: json.msg || "TikWM rejected request via proxy" });
    }

    // Return the safe default (empty profile) if no videos exist
    return res.json(defaultResponse);

  } catch (err) {
    console.error("Proxy scraper error: ", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ==========================================
// 6. EXPORT APP FOR VERCEL
// ==========================================
module.exports = app;
