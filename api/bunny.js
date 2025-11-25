// Vercel Serverless Function
// LOCATION: /api/bunny.js (MUST BE AT PROJECT ROOT)

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Robust Body Parsing
    let body = req.body;
    
    // Sometimes Vercel passes body as a string, sometimes as an object depending on headers
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error("[API] Failed to parse body string:", e);
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    }

    const { libraryId, videoId, chapters } = body || {};

    console.log(`[API] Processing Request - Lib: ${libraryId}, Video: ${videoId}`);

    if (!libraryId || !videoId || !chapters) {
      return res.status(400).json({ error: 'Missing required fields: libraryId, videoId, or chapters.' });
    }

    // 2. Security Check (Environment Variables)
    // We construct the key name dynamically based on the library ID selected
    const envKeyName = `BUNNY_KEY_${libraryId}`;
    const apiKey = process.env[envKeyName];

    const hasKey = !!apiKey;
    console.log(`[API] Looking for Env Var: ${envKeyName}. Found? ${hasKey}`);

    if (!apiKey) {
      return res.status(500).json({ 
        error: `Server Error: API Key for Library ID ${libraryId} not found in environment variables. Please check Vercel Settings.` 
      });
    }

    // 3. Forward to Bunny.net
    const url = `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'AccessKey': apiKey, 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        chapters: chapters
      }),
    });

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`[API] Bunny Upstream Error (${response.status}):`, responseText);
      return res.status(response.status).json({ 
        error: `Bunny.net Refused: ${responseText}` 
      });
    }

    console.log("[API] Success");
    
    // Attempt to parse JSON response, fallback to text if needed
    try {
      const data = JSON.parse(responseText);
      return res.status(200).json({ success: true, data });
    } catch (e) {
       return res.status(200).json({ success: true, message: "Updated, but response was not JSON", raw: responseText });
    }

  } catch (error) {
    console.error('[API] Critical Server Error:', error);
    return res.status(500).json({ error: `Internal Server Error: ${error.message}` });
  }
};