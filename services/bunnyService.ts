import { BunnyChapter } from "../types";

// --- CONFIGURATION ---
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
 */
export const updateBunnyChapters = async (
  apiKey: string, 
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
    const text = await response.text();

    // 1. Check for HTML (This is the #1 cause of "Not Working" - it means 404 Not Found)
    if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
      console.error("[BunnyService] 404 Error - Backend File Not Found");
      throw new Error(
        "CRITICAL ERROR: Backend Function Not Found (404). \n" +
        "You likely have 'api/bunny.js' inside the 'components' folder. \n" +
        "Please MOVE 'api/bunny.js' to the ROOT folder (same level as package.json) and Redeploy."
      );
    }

    // 2. Parse JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`Server returned invalid JSON: ${text.substring(0, 50)}...`);
    }

    // 3. Handle Logic Errors
    if (!response.ok || data.error) {
      console.error("[BunnyService] API Error:", data);
      throw new Error(data.error || `Server Error (${response.status})`);
    }
    
    console.log("[BunnyService] Update Success:", data);

  } catch (error: any) {
    console.error("[BunnyService] Network/Logic Error:", error);
    throw error; // Re-throw so the UI can display it
  }
};