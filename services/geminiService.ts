import { GoogleGenAI } from "@google/genai";
import { ChapterResult, CaptionResult } from "../types";

const getApiKey = (): string => {
  // 1. Try standard process.env (Node/Webpack/Next.js)
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
    return process.env.API_KEY;
  }
  
  // 2. Try Vite specific (import.meta.env)
  // We use 'as any' to avoid TS errors if the environment doesn't strictly type import.meta
  if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_KEY) {
    return (import.meta as any).env.VITE_API_KEY;
  }

  // 3. Fallback check for VITE_API_KEY in process.env (sometimes exposed by Vercel/bundlers)
  if (typeof process !== 'undefined' && process.env && process.env.VITE_API_KEY) {
    return process.env.VITE_API_KEY;
  }

  return '';
};

const getClient = () => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.error("API Key is missing. Checked process.env.API_KEY and VITE_API_KEY.");
    // We pass an empty string to let the SDK throw its own specific error, 
    // or we could throw here. The App.tsx handles errors gracefully.
    // However, the prompt requires using GoogleGenAI constructor. 
    // If we throw here, the App catches it.
  }

  return new GoogleGenAI({ apiKey: apiKey });
};

/**
 * Helper to scan the transcript and find the very last timestamp.
 * This is crucial for grounding the model to the end of the video.
 */
const getLastTimestamp = (text: string): string | null => {
  // Matches 00:00:00 or 00:00:00.000
  const matches = text.match(/(\d{2}:\d{2}:\d{2})/g);
  if (matches && matches.length > 0) {
    return matches[matches.length - 1];
  }
  return null;
};

// --- PROMPTS ---

const CHAPTERS_SYSTEM_PROMPT = (lastTimestamp: string) => `You are a Zoom Transcript Analyzer and Timestamp Formatter.
Your task has two outputs.

CRITICAL CONTEXT:
The transcript provided ends at approximately ${lastTimestamp}.
You MUST ensure your final chapter covers the content up to ${lastTimestamp}.
Do not stop early. Do not get lazy. Analyze the text until the very end.

PART 1 — Extract Key Topics (Human-Readable Format)
Analyze the transcript and extract exactly 8-10 main topics discussed.
Rules:
1. Ignore greetings, chit-chat, filler, and repeated questions.
2. Use exact timestamps from the transcript.
3. Sort all timestamps in ascending order.
4. Remove duplicates automatically.
5. Each topic title must be short (max 10–12 words).
6. TIMESTAMP FORMAT: HH:MM:SS (Strictly NO MILLISECONDS).
   - Incorrect: 00:02:03.450
   - Correct: 00:02:03
7. The last topic must correspond to the final section of the video (around ${lastTimestamp}).

Format each entry like this:
HH:MM:SS – Topic Title

PART 2 — Bunny Chapters (CSV Format)
Using the timestamps from Part 1, generate structured chapter data.
Rules:
1. Convert timestamps to total seconds.
2. Sort in ascending order.
3. Remove duplicates.
4. Each chapter end time = next chapter start time.
5. The final chapter end time = the exact timestamp of the last spoken text in the transcript (approx ${lastTimestamp}). Do NOT add extra buffer time to avoid exceeding video duration.
6. Format EXACTLY like this (no extra text):
start_seconds,end_seconds,title

Final Output Requirements:
Output PART 1 first, add a separator line "---PART_SEPARATOR---", then output PART 2.
No bullet points.
No explanation text.
Do not repeat transcript lines.`;

const CAPTIONS_SYSTEM_PROMPT = `You are a professional caption file formatter. Your task is to clean and reformat a long caption file (.srt or .vtt) for a 1–4 hour video session so it looks professional, readable, and ready for upload to Bunny.net.

Formatting Requirements
1. Line length:
○ Limit each caption block to 1–2 lines maximum.
○ Each line should ideally stay under 80 characters.
2. Duration:
○ If a caption lasts longer than 4 seconds or exceeds 2 lines, split it into smaller, readable parts.
3. Timestamps:
○ Maintain accurate timestamps.
○ No overlapping, merging unrelated speech, or dropping time markers.
4. Content cleanup:
○ Remove filler words (like “uh”, “umm”) unless contextually needed.
○ Remove all speaker names or identifiers (e.g., “John:” or “Speaker 1:”).
○ Preserve all spoken content and context.
5. Grammar & punctuation:
○ Use proper sentence casing and standard punctuation.
○ Ensure readability (split long sentences at natural pauses).
6. Format:
Output in valid .srt format with sequential numbering and timestamps.
Encode the file in UTF-8.

Output ONLY the raw SRT content. Do not wrap it in markdown code blocks. Do not add conversational text.`;

export const generateChapters = async (transcriptText: string): Promise<ChapterResult> => {
  const ai = getClient();
  
  // 1. Analyze file duration locally to ground the model
  const lastTime = getLastTimestamp(transcriptText) || "the end of the file";
  
  // 2. Use gemini-3-pro-preview. This is critical for long context retention.
  const modelId = "gemini-3-pro-preview";

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: transcriptText,
      config: {
        systemInstruction: CHAPTERS_SYSTEM_PROMPT(lastTime),
        temperature: 0.2, // Low temperature for adherence to instructions
      },
    });

    const fullText = response.text || "";
    
    // Parse the custom separator
    let parts = fullText.split("---PART_SEPARATOR---");
    
    // Fallback logic if separator is missing
    if (parts.length < 2) {
       const regexSplit = fullText.split(/PART 2.*Bunny Chapters/i);
       if (regexSplit.length >= 2) {
         parts = regexSplit;
       }
    }

    let humanReadable = parts[0] ? parts[0].trim() : "Error parsing Human Readable section.";
    let csvContent = parts[1] ? parts[1].trim() : "";

    // If CSV content is empty, attempt to rescue
    if (!csvContent && !humanReadable.includes("00:")) {
        humanReadable = "The model response format was unexpected:\n" + fullText;
    }

    // --- CRITICAL POST-PROCESSING ---
    // 1. Force remove milliseconds from Human Readable part (e.g. 00:00:39.250 -> 00:00:39)
    humanReadable = humanReadable.replace(/(\d{2}:\d{2}:\d{2})\.\d{1,3}/g, "$1");
    
    // 2. Ensure CSV is clean (remove code blocks if present)
    csvContent = csvContent.replace(/```csv/g, "").replace(/```/g, "").trim();

    return {
      humanReadable,
      csvContent
    };

  } catch (error) {
    console.error("Chapter Generation Error:", error);
    throw error;
  }
};

export const cleanCaptions = async (transcriptText: string): Promise<CaptionResult> => {
  const ai = getClient();

  // --- STRATEGY: Quality First, Stability Fallback ---
  // 1. Attempt with Gemini 3 Pro (Better quality).
  // 2. If it crashes (500 error), automatically fallback to Gemini 2.5 Flash (Better stability).

  const PRO_MODEL = "gemini-3-pro-preview";
  const FLASH_MODEL = "gemini-2.5-flash";

  let srtContent = "";

  try {
    console.log(`[Caption] Attempting with ${PRO_MODEL}...`);
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: transcriptText,
      config: {
        systemInstruction: CAPTIONS_SYSTEM_PROMPT,
        temperature: 0.1,
        maxOutputTokens: 8192, // Maximize token limit
      },
    });
    srtContent = response.text || "";
  } catch (error: any) {
    console.warn(`[Caption] ${PRO_MODEL} failed. Falling back to ${FLASH_MODEL}.`, error);
    
    // Fallback Attempt
    try {
      const response = await ai.models.generateContent({
        model: FLASH_MODEL,
        contents: transcriptText,
        config: {
          systemInstruction: CAPTIONS_SYSTEM_PROMPT,
          temperature: 0.1,
          maxOutputTokens: 8192,
        },
      });
      srtContent = response.text || "";
    } catch (fallbackError: any) {
      console.error(`[Caption] Fallback (${FLASH_MODEL}) also failed.`, fallbackError);
      throw new Error("Failed to generate captions. Both Pro and Flash models encountered errors. Please check the file length.");
    }
  }

  if (!srtContent) {
    throw new Error("AI returned empty content. This usually means the file was too long or the model timed out.");
  }
    
  // Basic cleanup if the model wraps in code blocks
  srtContent = srtContent.replace(/^```srt\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "");

  return {
    srtContent: srtContent.trim()
  };
};