const axios = require("axios");
require("dotenv").config();

async function analyzeSymptomsWithGemini(text) {
  const endpoint = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent";
  const apiKey = process.env.GEMINI_API_KEY;

  const prompt = `
You are a medical assistant. Based on the following symptoms, suggest 2–3 possible conditions with short descriptions and likelihood percentages.

Respond ONLY with raw JSON. Do NOT include markdown, code blocks, explanation, or formatting.

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

Symptoms: ${text}
`;

  try {
    const response = await axios.post(`${endpoint}?key=${apiKey}`, {
      contents: [{ parts: [{ text: prompt }] }]
    });

    const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Gemini raw response:", raw);

    // Extract JSON block using regex
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("No JSON block found in Gemini response.");
      return [];
    }

    const parsed = JSON.parse(match[0]);
    return parsed.suggestions || [];
  } catch (err) {
    console.error("Gemini REST error:", err.response?.data || err.message);
    return [];
  }
}

module.exports = { analyzeSymptomsWithGemini };