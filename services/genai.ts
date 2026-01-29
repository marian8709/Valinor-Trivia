import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TriviaQuestion, GroundingSource, Difficulty } from "../types";

// Initialize AI client
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Fallback questions to use when API quota is exhausted
const FALLBACK_QUESTIONS: TriviaQuestion[] = [
  {
    question: "I'm detecting high traffic on my neural pathways (Rate Limit). While I recalibrate: What is the largest ocean on Earth?",
    options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
    correctAnswerIndex: 3,
    explanation: "The Pacific Ocean is the largest and deepest of Earth's oceanic divisions.",
    topic: "Geography",
    hint: "It's on the West Coast of the United States."
  },
  {
    question: "My servers are a bit toasty! Let's cool down with this: What is the freezing point of water?",
    options: ["0°C", "100°C", "32°C", "-273°C"],
    correctAnswerIndex: 0,
    explanation: "Water freezes at 0 degrees Celsius at standard atmospheric pressure.",
    topic: "Science",
    hint: "It's the start of the Celsius scale."
  },
  {
    question: "Network congestion detected. Switching to offline archives: Who painted the Mona Lisa?",
    options: ["Vincent van Gogh", "Leonardo da Vinci", "Pablo Picasso", "Claude Monet"],
    correctAnswerIndex: 1,
    explanation: "Leonardo da Vinci painted the Mona Lisa in the early 16th century.",
    topic: "Art",
    hint: "A true Renaissance man."
  },
  {
    question: "I need a quick recharge. While I'm offline: Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correctAnswerIndex: 1,
    explanation: "Mars appears red due to iron oxide prevalent on its surface.",
    topic: "Astronomy",
    hint: "Named after the Roman god of war."
  }
];

/**
 * Generates a trivia question using Gemini 3 Flash with Search Grounding
 * Now accepts a history of previous questions to avoid repetition.
 * Includes retry logic for 429 errors.
 */
export const generateTriviaQuestion = async (
  topic: string, 
  personality: string,
  difficulty: Difficulty,
  previousQuestions: string[] = []
): Promise<{ questionData: TriviaQuestion; sources: GroundingSource[] }> => {
  const ai = getClient();
  
  // Create a filter list of the last 30 questions to keep the prompt efficient and reduce repetition
  const exclusionList = previousQuestions.slice(-30).map(q => `"${q}"`).join(", ");

  const difficultyInstruction = {
    'Easy': "Keep questions simple, focusing on common knowledge and well-known facts.",
    'Medium': "Questions should require some specific knowledge but not be obscure.",
    'Hard': "Ask obscure, challenging, or very specific questions (dates, minor details, complex facts)."
  }[difficulty];

  // List of lenses to force the model to explore different sub-topics
  const subTopicLenses = [
    "History & Origins",
    "Technology & Mechanics",
    "Cultural Impact & Legacy",
    "Scientific Principles",
    "Rare & Obscure Facts",
    "Famous Figures & Creators",
    "Geography & Settings",
    "Statistics & Records",
    "Behind the Scenes & Production",
    "Etymology & Terminology",
    "Misconceptions & Myths",
    "Business & Economics"
  ];

  // Randomly select a lens to view the topic through
  const randomLens = subTopicLenses[Math.floor(Math.random() * subTopicLenses.length)];

  // Generate a random seed to force the model to look at the topic from different angles
  const randomSeed = Math.floor(Math.random() * 1000000);

  const systemPrompt = `You are a trivia host with the following personality: ${personality}. 
  Generate a trivia question about "${topic}".
  
  CRITICAL INSTRUCTIONS:
  1. Difficulty Level: ${difficulty}. ${difficultyInstruction}
  2. SUB-TOPIC STRATEGY: Focus the question specifically on the "${randomLens}" aspect of "${topic}". This is a mandatory constraint to ensure variety.
  3. Do NOT repeat any of the following questions: [${exclusionList}].
  4. Ensure the facts are accurate and up-to-date.
  5. Provide a clear and concise explanation.
  6. Provide a subtle hint that guides the player without giving the answer away.
  
  Return the response in JSON format.
  `;

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Generate a unique, creative, and ${difficulty} difficulty trivia question about ${topic} focusing on ${randomLens}. Random Seed: ${randomSeed}`,
          config: {
            systemInstruction: systemPrompt,
            temperature: 1.2, // Increased temperature for more variety
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "Array of 4 possible answers"
                },
                correctAnswerIndex: { type: Type.INTEGER, description: "Index (0-3) of the correct answer" },
                explanation: { type: Type.STRING, description: "A brief explanation of the correct answer" },
                topic: { type: Type.STRING },
                hint: { type: Type.STRING, description: "A subtle clue for the player." }
              },
              required: ["question", "options", "correctAnswerIndex", "explanation", "topic", "hint"]
            }
          }
        });

        let jsonText = response.text || "{}";
        // Strip markdown code blocks if present (Gemini sometimes adds them despite mimeType)
        if (jsonText.startsWith("```")) {
            jsonText = jsonText.replace(/^```(json)?\s*/, "").replace(/\s*```$/, "");
        }
        
        const questionData = JSON.parse(jsonText) as TriviaQuestion;
        
        // Extract grounding sources
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources: GroundingSource[] = chunks
          .map(chunk => chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : null)
          .filter((s): s is GroundingSource => s !== null);

        return { questionData, sources };

    } catch (error: any) {
        attempts++;
        const isRateLimit = error.message?.includes('429') || error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED') || error.status === 503;
        
        if (isRateLimit) {
            console.warn(`API Error (Attempt ${attempts}/${maxAttempts}): ${error.message}. Retrying...`);
            if (attempts < maxAttempts) {
                // Exponential backoff: 1s, 2s...
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
                continue;
            } else {
                 console.warn("Max retries reached. Using fallback question.");
                 const fallback = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
                 return { questionData: fallback, sources: [] };
            }
        }
        console.error("Error generating question:", error);
        throw error;
    }
  }
  throw new Error("Unexpected loop termination");
};

/**
 * Generates speech from text using Gemini 2.5 TTS
 */
export const generateSpeech = async (text: string, personality: string): Promise<string> => {
  const ai = getClient();
  
  // Voices: Puck, Charon, Kore, Fenrir, Aoede
  // We use known stable voices for the TTS endpoint
  let voiceName = 'Puck'; // Default (Genderless/Playful)
  
  const p = personality.toLowerCase();
  if (p.includes('sarcastic')) voiceName = 'Fenrir'; // Deep/Authoritative
  if (p.includes('excited')) voiceName = 'Kore'; // Energetic/Female-sounding
  if (p.includes('pirate')) voiceName = 'Charon'; // Deep/Rough
  if (p.includes('professor')) voiceName = 'Fenrir'; // Authoritative
  if (p.includes('mysterious')) voiceName = 'Aoede'; // Elegant/High
  
  // New Personalities
  if (p.includes('harry')) voiceName = 'Puck'; // Youthful/Standard
  if (p.includes('rings') || p.includes('middle-earth')) voiceName = 'Fenrir'; // Deep/Wise/Wizard-like

  // Sanitize text: Remove newlines, excessive whitespace, and markdown symbols to prevent 500 errors
  // Gemini TTS can be sensitive to formatting characters
  const cleanText = text
    .replace(/[*_#`~]/g, '') // Remove markdown
    .replace(/[\r\n]+/g, ' ') // Remove newlines
    .replace(/\s+/g, ' ')     // Collapse spaces
    .trim();

  // If text is empty after cleaning, don't call API
  if (!cleanText) return "";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data generated");
    
    return base64Audio;
  } catch (error: any) {
    // Handle Quota Limits (429) gracefully so the app doesn't crash visually
    if (error.message?.includes('429') || error.status === 429 || error.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn("TTS Quota Exceeded. Audio playback skipped.");
      return "";
    }
    console.error("Error generating speech:", error);
    return "";
  }
};