export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { libraryId, videoId, chapters } = req.body;

    console.log(`[API] Received request for Library: ${libraryId}, Video: ${videoId}`);

    if (!libraryId || !videoId || !chapters) {
      return res.status(400).json({ error: 'Missing required fields: libraryId, videoId, or chapters.' });
    }

    // SECURITY:
    // Look for the API key in Vercel Environment Variables.
    const envKeyName = `BUNNY_KEY_${libraryId}`;
    const apiKey = process.env[envKeyName];

    if (!apiKey) {
      console.error(`[API] Error: Environment variable ${envKeyName} is missing.`);
      return res.status(500).json({ 
        error: `Server configuration error: API Key not found for Library ID ${libraryId}. Please check Vercel Environment Variables.` 
      });
    }

    const url = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'AccessKey': apiKey, // Injected securely from server side
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        chapters: chapters
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[API] Bunny.net upstream error (${response.status}):`, errorText);
      return res.status(response.status).json({ 
        error: `Bunny.net Error: ${errorText}` 
      });
    }

    const data = await response.json();
    return res.status(200).json({ success: true, data });

  } catch (error) {
    console.error('[API] Server Internal Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
}