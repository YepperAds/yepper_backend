// controllers/aiController.js
const promptEngine = require('../utils/promptEngine');

exports.generateResponse = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Process message through prompt engine
    const engineResult = promptEngine.process(message);

    // Call Gemini API with enhanced prompt
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'AI service not configured - GEMINI_API_KEY is missing'
      });
    }

    console.log('Calling Gemini API with intent:', engineResult.intent);

    // CORRECT: Use v1beta with gemini-2.0-flash-exp (latest stable experimental model)
    // Alternative options: gemini-1.5-pro-latest, gemini-1.5-flash-latest
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${engineResult.systemPrompt}

USER QUESTION: ${message}

Provide a comprehensive, strategic response that is actionable and specific to their situation. Be conversational, helpful, and provide concrete next steps.`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API Error:', errorData);
      
      // If model not found, list available alternatives
      if (errorData.error?.status === 'NOT_FOUND') {
        console.error('Model not found. Try one of these alternatives:');
        console.error('- gemini-1.5-pro-latest');
        console.error('- gemini-1.5-flash-latest');
        console.error('- gemini-pro');
      }
      
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    
    console.log('Gemini response received successfully');
    
    // Check if we got a valid response
    if (data.candidates && 
        data.candidates[0] && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts[0] && 
        data.candidates[0].content.parts[0].text) {
      
      return res.json({
        success: true,
        response: data.candidates[0].content.parts[0].text,
        metadata: {
          intent: engineResult.intent,
          suggestions: engineResult.suggestions,
          context: engineResult.context
        }
      });
    }
    
    // If no valid response, check for safety ratings or other issues
    if (data.candidates && data.candidates[0] && data.candidates[0].finishReason) {
      console.error('Gemini finish reason:', data.candidates[0].finishReason);
      
      // Handle specific finish reasons
      if (data.candidates[0].finishReason === 'SAFETY') {
        throw new Error('Response blocked due to safety filters. Please rephrase your question.');
      }
      
      throw new Error(`Gemini API returned finish reason: ${data.candidates[0].finishReason}`);
    }
    
    throw new Error('Invalid response structure from Gemini API');
    
  } catch (error) {
    console.error('AI generation error:', error);
    console.error('Error details:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate response',
      error: error.message
    });
  }
};