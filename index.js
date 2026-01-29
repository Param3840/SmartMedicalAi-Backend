const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const User = require("./models/User");
const Reminder = require("./models/Reminder");

const app = express();
app.use(express.json());

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ---------------- ROOT ----------------
app.get("/", (req, res) => {
  res.json({ ok: true });
});

// ---------------- AUTH ----------------
app.post("/signup", async (req, res) => {
  const { fullName, age, gender, email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ fullName, age, gender, email, password: hash });
    await user.save();

    res.status(201).json({
      success: true,
      user: {
        fullName: user.fullName,
        email: user.email,
        gender: user.gender,
        age: user.age,
      }
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        gender: user.gender,
        age: user.age,
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ---------------- REMINDER ----------------
app.post("/reminder", async (req, res) => {
  const { userId, task, interval, time } = req.body;

  if (!userId || !task || (!interval && !time)) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    const reminder = new Reminder({ userId, task, interval, time });
    await reminder.save();
    res.status(201).json({ success: true, reminder });
  } catch (err) {
    console.error("Reminder error:", err);
    res.status(500).json({ success: false, message: "Failed to save reminder" });
  }
});

app.get("/reminder/:userId", async (req, res) => {
  try {
    const reminders = await Reminder.find({ userId: req.params.userId });
    res.json({ success: true, reminders });
  } catch (err) {
    console.error("Reminder fetch error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch reminders" });
  }
});

// ---------------- ANALYZE ----------------
const fallbackRules = {
  fever: [
    { name: "Flu", description: "Common viral infection", percentage: 70, mostLikely: true },
    { name: "Viral infection", description: "General viral illness", percentage: 30 }
  ],
  "stomach pain": [
    { name: "Gastritis", description: "Inflammation of stomach lining", percentage: 60, mostLikely: true },
    { name: "Food poisoning", description: "Caused by contaminated food", percentage: 40 }
  ],
  cough: [
    { name: "Cold", description: "Mild viral infection", percentage: 50, mostLikely: true },
    { name: "Bronchitis", description: "Inflammation of airways", percentage: 50 }
  ],
  headache: [
    { name: "Migraine", description: "Neurological condition causing severe headaches", percentage: 60, mostLikely: true },
    { name: "Tension headache", description: "Stress-related headache", percentage: 40 }
  ]
};

app.post("/analyze", async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim() === "") {
    return res.json({
      suggestions: [
        {
          name: "Insufficient Information",
          description: "No symptoms were provided. A differential diagnosis requires a list of symptoms.",
          percentage: 100,
          mostLikely: true
        }
      ]
    });
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
               text: `You are a medical assistant. Based on the following symptoms, suggest 2–3 possible conditions with short descriptions and likelihood percentages.

Respond ONLY with raw JSON. Do NOT include markdown, code blocks, explanation, or formatting. Do NOT add any text before or after the JSON.

Return exactly this format:
{
  "suggestions": [
    {
      "name": "Condition name",
      "description": "Short explanation",
      "percentage": 70,
      "mostLikely": true
    }
  ]
}

Symptoms: ${text}`

              }
            ]
          }
        ]
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("Gemini raw response:", rawText);
    const match = rawText.match(/\{[\s\S]*\}/);
console.log("Matched JSON block:", match?.[0]);


    let suggestions = [];
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        suggestions = parsed.suggestions || [];
      } else {
        console.warn("No JSON block found in Gemini response.");
      }
    } catch (err) {
      console.warn("Failed to parse Gemini JSON:", err.message);
    }

    if (suggestions.length === 0) {
      const matched = Object.keys(fallbackRules).filter(symptom =>
        text.toLowerCase().includes(symptom)
      );
      suggestions = matched.flatMap(symptom => fallbackRules[symptom]);

      if (suggestions.length === 0) {
        suggestions = [
          { name: "General checkup", description: "Consult a doctor for accurate diagnosis", percentage: 100, mostLikely: true }
        ];
      }
    }

    return res.json({ suggestions });
  } catch (err) {
    console.error("Gemini error:", err.message);

    const matched = Object.keys(fallbackRules).filter(symptom =>
      text.toLowerCase().includes(symptom)
    );
    let suggestions = matched.flatMap(symptom => fallbackRules[symptom]);

    if (suggestions.length === 0) {
      suggestions = [
        { name: "General checkup", description: "Consult a doctor for accurate diagnosis", percentage: 100, mostLikely: true }
      ];
    }

    return res.json({ suggestions });
  }
});

// ---------------- GEO LOCATION ----------------
app.get("/geo-location", async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: "Missing coordinates" });
  }

  try {
    const response = await axios.get(
      `https://api.geoapify.com/v2/places?categories=healthcare.hospital&filter=circle:${lng},${lat},30000&bias=proximity:${lng},${lat}&limit=10&apiKey=${process.env.GEOAPI_KEY}`
    );

    const data = response.data;

    const hospitals = data.features
      .filter((place) => place.properties.name)
      .map((place) => {
        const name = place.properties.name;
        const lat = place.geometry.coordinates[1];
        const lng = place.geometry.coordinates[0];

        return {
          name,
          address: place.properties.address_line1 || "No address",
          distance: place.properties.distance || 0,
          lat,
          lng,
          visitUrl: `https://www.google.com/search?q=${encodeURIComponent(name + " hospital")}`
        };
      });

    res.json({ hospitals });
  } catch (err) {
    console.error("GeoAPI error:", err.message);
    res.status(500).json({ error: "Failed to fetch data from GeoAPI" });
  }
});
app.listen(process.env.PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${process.env.PORT}`);
});