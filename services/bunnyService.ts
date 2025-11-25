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
  const chapters = parseCsvToBunnyChapters(csvContent);

  if (chapters.length === 0) {
    throw new Error("No valid chapters found in the data.");
  }

  if (!libraryId) {
    throw new Error("Missing Library ID.");
  }

  // Call our own internal API route (Serverless Function)
  const response = await fetch('/api/bunny', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      libraryId,
      videoId,
      chapters
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Server Error (${response.status})`);
  }
};