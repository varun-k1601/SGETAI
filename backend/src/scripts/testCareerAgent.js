import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

async function testCareerAgent() {
  console.log("Testing Career Agent setup...\n");

  const apiKey = process.env.GEMINI_API_KEY;
  console.log(`✓ GEMINI_API_KEY present: ${Boolean(apiKey)}`);
  console.log(`✓ API Key valid format: ${apiKey && !apiKey.includes("replace_me")}`);

  if (!apiKey || apiKey.includes("replace_me")) {
    console.log("\n❌ GEMINI_API_KEY is missing or placeholder\n");
    return;
  }

  try {
    console.log("\nInitializing Gemini client...");
    const client = new GoogleGenAI({ apiKey });
    console.log("✓ Gemini client initialized\n");

    console.log("Testing API call with a simple question...");
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "What does a support engineer do? Answer in 2 sentences."
            }
          ]
        }
      ]
    });

    if (response && response.text) {
      console.log("✅ API call successful!\n");
      console.log("Response:", response.text);
    } else {
      console.log("❌ API returned no response text\n");
    }
  } catch (error) {
    console.log("❌ API call failed!\n");
    console.log("Error:", error.message);
    console.log("\nPossible causes:");
    console.log("1. Invalid or expired API key");
    console.log("2. Gemini API service is unavailable");
    console.log("3. API key lacks required permissions");
    console.log("4. Rate limit exceeded");
    console.log("5. Network connectivity issue");
  }
}

testCareerAgent();
