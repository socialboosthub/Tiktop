const express = require("express");
const fetch = require("node-fetch");

const app = express();

// API: Fetch TikTok data
app.get("/api", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "No URL provided" });

    const apiUrl = `https://tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;

    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)"
      }
    });

    const json = await response.json();
    res.json(json);
  } catch {
    res.status(500).json({ error: "API failed" });
  }
});

// MP3 Backend Route
app.get("/mp3", async (req, res) => {
  try {
    const response = await fetch(req.query.url);
    
    // Get ID from frontend, or default to random if missing
    const id = req.query.id || Math.floor(Math.random() * 100000);
    const fileName = `tiktop-${id}.mp3`;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );
    response.body.pipe(res);
  } catch {
    res.status(500).send("Audio download failed");
  }
});


// VIDEO
app.get("/download", async (req, res) => {
  try {
    const response = await fetch(req.query.url);
    
    const id = req.query.id || "video";
    
    // Check if hd=1 is in the URL. If yes, add _hd.
    let fileName;
    if (req.query.hd === "1") {
        fileName = `tiktop-${id}_hd.mp4`;
    } else {
        fileName = `tiktop-${id}.mp4`;
    }

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.body.pipe(res);
  } catch {
    res.status(500).send("Download failed");
  }
});

// IMAGE

app.get("/image", async (req, res) => {
  try {
    const response = await fetch(req.query.url);
    
    const id = req.query.id || "image";
    const index = req.query.index ? `-img-${req.query.index}` : "";
    
    // Result: tiktop-748293-img-1.jpeg
    const fileName = `tiktop-${id}${index}.jpeg`;

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.body.pipe(res);
  } catch {
    res.status(500).send("Image download failed");
  }
});


module.exports = app;
