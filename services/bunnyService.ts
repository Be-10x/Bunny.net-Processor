import { BunnyChapter } from "../types";

// --- CONFIGURATION ---
// The IDs must match what you configure in Vercel Environment Variables.
// Example: If ID is "239218", ensure you have a Vercel Env Var named "BUNNY_KEY_239218"

export const BUNNY_LIBRARIES = [
  { name: "astro", id: "275001" },
  { name: "AstroLMS", id: "275084" },
  { name: "C2C LMS", id: "257555" },
  { name: "Dr Finance (Presto Public)", id: "273694" },
  { name: "InfiniteLMS", id: "239218" }, 
  { name: "Internal Use", id: "466125" },
  { name: "MadAboutSportsLMS", id: "253889" },
  { name: "ProfitUniLMS", id: "243034" },
  { name: "SPRINGPAD (Presto Public)", id: "286744" },
  { name: "TechGurukul LMS (Presto Public)", id: "279217" },
  { name: "WDNTV", id: "248436" },
  { name: "Yogalution LMS", id: "375077" },
];

/**
 * Parses the CSV string (start,end,title) into Bunny.net JSON structure.
 */
export const parseCsvToBunnyChapters = (csvContent: string): BunnyChapter[] => {
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const chapters: BunnyChapter[] = [];

  for (const line of lines) {
    // Regex to match: start,end,title (allowing for commas in title if needed)
    const parts = line.split(',');
    
    if (parts.length >= 3) {
      const start = parseInt(parts[0].trim(), 10);
      const end = parseInt(parts[1].trim(), 10);
      const title = parts.slice(2).join(',').trim();

      if (!isNaN(start) && !isNaN(end) && title) {
        chapters.push({
          start,
          end,
          title
        });
      }
    }
  }

  return chapters;
};

/**
 * Sends the chapter data to our internal secure API route.
 * The API route handles the actual authentication with Bunny.net.
 */
export const updateBunnyChapters = async (
  apiKey: string, // Unused in this version, kept for signature compatibility
  libraryId: string,
  videoId: string,
  csvContent: string
): Promise<void> => {
  console.log(`[BunnyService] Initiating update for Lib: ${libraryId}, Video: ${videoId}`);
  
  const chapters = parseCsvToBunnyChapters(csvContent);

  if (chapters.length === 0) {
    throw new Error("No valid chapters found in the data. Please check the CSV format.");
  }

  if (!libraryId) {
    throw new Error("Missing Library ID.");
  }

  try {
    // Call our own internal API route (Serverless Function)
    const response = await fetch('/api/bunny', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        libraryId: libraryId.trim(),
        videoId: videoId.trim(),
        chapters
      }),
    });

    const contentType = response.headers.get("content-type");
    
    // Check if the response is JSON (API) or HTML (Vite/SPA Fallback usually indicating 404)
    if (contentType && contentType.indexOf("application/json") === -1) {
      const text = await response.text();
      console.error("[BunnyService] Received non-JSON response:", text.substring(0, 150));
      
      if (text.includes("<!DOCTYPE html>")) {
        throw new Error(
          "API endpoint not found. If you are running locally on 'npm run dev', the backend API will not work. You must deploy to Vercel or use 'vercel dev'."
        );
      }
      throw new Error(`Server returned unexpected content type: ${contentType}`);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("[BunnyService] API Error Response:", data);
      throw new Error(data.error || `Server Error (${response.status})`);
    }
    
    console.log("[BunnyService] Update Success:", data);

  } catch (error: any) {
    console.error("[BunnyService] Network/Logic Error:", error);
    throw new Error(error.message || "Network request failed. Check console for details.");
  }
};