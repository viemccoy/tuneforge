// AI generation endpoint
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Log request details for debugging
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  
  try {
    const { binId, systemPrompt, messages, models, temperature, maxTokens, max_completion_tokens, n } = await request.json();
    
    console.log(`[${timestamp}] Request ${requestId}:`, {
      binId,
      messageCount: messages?.length || 0,
      models: models || [],
      lastMessage: messages?.length > 0 ? messages[messages.length - 1].content.substring(0, 50) + '...' : 'none'
    });
    
    if (!binId || !messages || !models || models.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Initialize AI clients
    const openai = env.OPENAI_API_KEY ? new OpenAI({
      apiKey: env.OPENAI_API_KEY
    }) : null;
    
    const anthropic = env.ANTHROPIC_API_KEY ? new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY
    }) : null;
    
    const google = env.GOOGLE_API_KEY ? new GoogleGenerativeAI(env.GOOGLE_API_KEY) : null;
    
    // Initialize OpenRouter client for Deepseek models
    const openrouter = env.OPENROUTER_API_KEY ? new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1'
    }) : null;
    
    // Generate responses in parallel
    const responsePromises = models.map(async (modelId) => {
      try {
        // Handle OpenAI models (including o3/o4-mini)
        if ((modelId.startsWith('gpt') || modelId.startsWith('o3') || modelId.startsWith('o4')) && openai) {
          const isO3Model = modelId.includes('o3') || modelId.includes('o4-mini');
          
          const params = {
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            n: n || 1
          };
          
          // Use appropriate parameters based on model type
          if (isO3Model) {
            params.max_completion_tokens = max_completion_tokens || maxTokens || 1000;
            // o3 models don't support temperature
          } else {
            params.temperature = temperature || 0.7;
            params.max_tokens = maxTokens || 1000;
          }
          
          const completion = await openai.chat.completions.create(params);
          
          // If multiple completions requested, return all
          if (n > 1) {
            return {
              model: modelId,
              choices: completion.choices.map(choice => ({
                content: choice.message.content,
                index: choice.index
              })),
              usage: completion.usage
            };
          }
          
          return {
            model: modelId,
            content: completion.choices[0].message.content,
            usage: completion.usage
          };
        } else if (modelId.startsWith('claude') && anthropic) {
          const completion = await anthropic.messages.create({
            model: modelId,
            system: systemPrompt,
            messages: messages.map(m => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content: m.content
            })),
            temperature: temperature || 0.7,
            max_tokens: maxTokens || 1000
          });
          
          return {
            model: modelId,
            content: completion.content[0].text,
            usage: {
              prompt_tokens: completion.usage.input_tokens,
              completion_tokens: completion.usage.output_tokens,
              total_tokens: completion.usage.input_tokens + completion.usage.output_tokens
            }
          };
        } else if ((modelId.startsWith('deepseek') || modelId.startsWith('x-ai/grok')) && openrouter) {
          // Handle Deepseek and Grok models through OpenRouter
          const completion = await openrouter.chat.completions.create({
            model: modelId,
            messages: [
              { role: 'system', content: systemPrompt },
              ...messages
            ],
            temperature: temperature || 0.7,
            max_tokens: maxTokens || 1000
          });
          
          return {
            model: modelId,
            content: completion.choices[0].message.content,
            usage: completion.usage
          };
        } else if ((modelId.includes('gemini') || modelId.startsWith('models/gemini')) && google) {
          // Handle Google Gemini models
          const modelName = modelId.replace('models/', ''); // Remove 'models/' prefix if present
          const model = google.getGenerativeModel({ model: modelName });
          
          // Combine system prompt with first user message for Gemini
          const combinedMessages = [...messages];
          if (systemPrompt && combinedMessages.length > 0 && combinedMessages[0].role === 'user') {
            combinedMessages[0] = {
              ...combinedMessages[0],
              content: `${systemPrompt}\n\n${combinedMessages[0].content}`
            };
          }
          
          // Convert messages to Gemini format
          const history = [];
          let currentPrompt = '';
          
          combinedMessages.forEach((msg, index) => {
            if (index === combinedMessages.length - 1 && msg.role === 'user') {
              currentPrompt = msg.content;
            } else {
              history.push({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
              });
            }
          });
          
          const chat = model.startChat({ history });
          const result = await chat.sendMessage(currentPrompt);
          const response = await result.response;
          
          return {
            model: modelId,
            content: response.text(),
            usage: {
              // Gemini doesn't provide token counts in the same way
              total_tokens: Math.ceil((currentPrompt.length + response.text().length) / 4)
            }
          };
        } else {
          return {
            model: modelId,
            error: 'Model not available'
          };
        }
      } catch (error) {
        console.error(`Error with ${modelId}:`, error);
        return {
          model: modelId,
          error: error.message
        };
      }
    });
    
    const responses = await Promise.all(responsePromises);
    
    // Log response summary
    const successCount = responses.filter(r => !r.error).length;
    console.log(`[${timestamp}] Request ${requestId} completed:`, {
      totalResponses: responses.length,
      successfulResponses: successCount,
      failedResponses: responses.length - successCount
    });
    
    return new Response(JSON.stringify({ responses }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error(`[${timestamp}] Request ${requestId} error:`, {
      error: error.message,
      stack: error.stack
    });
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}