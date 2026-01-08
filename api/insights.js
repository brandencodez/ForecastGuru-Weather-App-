// Handles AI weather insights requests using Groq API
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const weatherData = req.body;
    const API_KEY = process.env.GROQ_API_KEY;

    if (!API_KEY) {
      return res.status(500).json({ error: 'Server configuration error: Missing GROQ_API_KEY in .env' });
    }

    const { name, main, weather, wind, sys } = weatherData;

    // Build forecast info (same as before)
    let forecastInfo = '';
    if (weatherData.forecast?.list?.length > 0) {
      forecastInfo = '\n\nUpcoming 5-day forecast:';
      const dailyForecasts = [];
      const processedDates = new Set();

      weatherData.forecast.list.forEach(forecast => {
        const date = new Date(forecast.dt * 1000).toLocaleDateString();
        if (!processedDates.has(date)) {
          processedDates.add(date);
          dailyForecasts.push(forecast);
        }
      });

      dailyForecasts.slice(0, 5).forEach(forecast => {
        const date = new Date(forecast.dt * 1000);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        forecastInfo += `\n- ${dayName}: ${forecast.weather[0].main} (${forecast.weather[0].description}), ${forecast.main.temp.toFixed(1)}°C, humidity ${forecast.main.humidity}%, wind ${forecast.wind.speed} km/h`;
      });
    }

    const prompt = `You are an AI weather assistant. First introduce yourself briefly (keep this introduction short and consistent), then provide 3–4 personalized insights and recommendations based on the following current weather conditions in ${name}, ${sys.country}, and provide just 2–3 suggestions based on the 5-day forecast at the end separately:
- Temperature: ${main.temp.toFixed(1)}°C (feels like ${main.feels_like.toFixed(1)}°C)
- Weather: ${weather[0].main} (${weather[0].description})
- Humidity: ${main.humidity}%
- Wind speed: ${wind.speed} km/h${forecastInfo}

Format your response as a bulleted list with emoji icons. Include health tips, clothing recommendations, activity suggestions, safety precautions if any, and other useful relevant information. Keep each point concise and actionable.`;

    // Groq API call
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', // or another supported Groq model like 'llama3-8b-8192'
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.6,
        max_tokens: 500,
        top_p: 1,
        stream: false
      })
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}));
      console.error('Groq API error:', groqResponse.status, errorData);
      return res.status(groqResponse.status).json({
        error: 'Failed to fetch response from Groq API',
        details: errorData
      });
    }

    const data = await groqResponse.json();

    if (data.choices && data.choices[0]?.message?.content) {
      return res.status(200).json({ text: data.choices[0].message.content.trim() });
    } else {
      return res.status(500).json({ error: 'Unexpected Groq API response structure' });
    }
  } catch (error) {
    console.error('Groq handler error:', error);
    return res.status(500).json({
      error: 'Failed to generate insights',
      message: error.message
    });
  }
}