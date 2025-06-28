// AI generation endpoint
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { binId, systemPrompt, messages, models, temperature, maxTokens } = await request.json();
    
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
    
    // Generate responses in parallel
    const responsePromises = models.map(async (modelId) => {
      try {
        if (modelId.startsWith('gpt') && openai) {
          const completion = await openai.chat.completions.create({
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
    
    return new Response(JSON.stringify({ responses }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}