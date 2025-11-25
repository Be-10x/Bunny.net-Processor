import { BunnyChapter } from "../types";

// --- CONFIGURATION ---
// PASTE YOUR REAL API KEYS AND LIBRARY IDS HERE
export const BUNNY_LIBRARIES = [
  { name: "astro", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "AstroLMS", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "C2C LMS", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "Dr Finance (Presto Public)", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "InfiniteLMS", id: "239218", apiKey: "REPLACE_WITH_KEY" }, // ID from screenshot
  { name: "Internal Use", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "MadAboutSportsLMS", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "ProfitUniLMS", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "SPRINGPAD (Presto Public)", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "TechGurukul LMS (Presto Public)", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "WDNTV", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
  { name: "Yogalution LMS", id: "REPLACE_WITH_ID", apiKey: "REPLACE_WITH_KEY" },
];

/**
 * Parses the CSV string (start,end,title) into Bunny.net JSON structure.
 */
export const parseCsvToBunnyChapters = (csvContent: string): BunnyChapter[] => {
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  const chapters: BunnyChapter[] = [];

  for (const line of lines) {
    // Regex to match: start,end,title (allowing for commas in title if needed, though simple split is usually safer for this specific format)
    // Expected format: 123,456,Title Text
    const parts = line.split(',');
    
    if (parts.length >= 3) {
      const start = parseInt(parts[0].trim(), 10);
      const end = parseInt(parts[1].trim(), 10);
      // Join the rest back together in case the title has a comma
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
 * Sends the chapter data to Bunny.net API.
 */
export const updateBunnyChapters = async (
  apiKey: string,
  libraryId: string,
  videoId: string,
  csvContent: string
): Promise<void> => {
  const chapters = parseCsvToBunnyChapters(csvContent);

  if (chapters.length === 0) {
    throw new Error("No valid chapters found in the data.");
  }

  const url = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'AccessKey': apiKey, // Bunny.net uses AccessKey header
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      chapters: chapters
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `API Error (${response.status})`;
    try {
      const jsonError = JSON.parse(errorBody);
      if (jsonError.message) errorMessage = jsonError.message;
    } catch (e) {
      // ignore json parse error
    }
    throw new Error(`Bunny.net: ${errorMessage}`);
  }
};