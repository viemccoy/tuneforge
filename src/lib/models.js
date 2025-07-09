import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class ModelManager {
  constructor(mlflowTracer = null) {
    this.mlflowTracer = mlflowTracer;
    
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      ...(process.env.OPENAI_BASE_URL && { baseURL: process.env.OPENAI_BASE_URL })
    }) : null;

    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    }) : null;

    this.google = process.env.GOOGLE_API_KEY ? new GoogleGenerativeAI(
      process.env.GOOGLE_API_KEY
    ) : null;

    this.models = this.getAvailableModels();
  }

  getAvailableModels() {
    const models = [];
    
    if (this.openai) {
      models.push(
        { name: 'GPT-4.1', id: 'gpt-4.1-2025-04-14', provider: 'openai' },
        { name: 'GPT-o3', id: 'o3-2025-04-16', provider: 'openai' },
        { name: 'GPT-o3-pro', id: 'o3-pro-2025-04-16', provider: 'openai' }
      );
    }

    // Anthropic models hidden from UI but kept in backend for compatibility
    // if (this.anthropic) {
    //   models.push(
    //     { name: 'Claude Opus 4', id: 'claude-opus-4-20250514', provider: 'anthropic' },
    //     { name: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514', provider: 'anthropic' }
    //   );
    // }

    if (this.google) {
      models.push(
        { name: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro', provider: 'google' },
        { name: 'Gemini 2.5 Flash', id: 'gemini-2.5-flash', provider: 'google' }
      );
    }

    return models;
  }

  async generateResponse(modelId, systemPrompt, userPrompt, options = {}) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 1000;

    try {
      if (model.provider === 'openai') {
        return await this.generateOpenAIResponse(model.id, systemPrompt, userPrompt, { temperature, maxTokens });
      } else if (model.provider === 'anthropic') {
        return await this.generateAnthropicResponse(model.id, systemPrompt, userPrompt, { temperature, maxTokens });
      } else if (model.provider === 'google') {
        return await this.generateGoogleResponse(model.id, systemPrompt, userPrompt, { temperature, maxTokens });
      }
    } catch (error) {
      console.error(`❌ Error with ${model.name} (${modelId}):`, error);
      console.error(`❌ Error details:`, {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        response: error.response?.data,
        stack: error.stack
      });
      
      return {
        content: `Error with ${model.name}: ${error.message}${error.status ? ` (Status: ${error.status})` : ''}`,
        model: model.name,
        error: true
      };
    }
  }

  async generateOpenAIResponse(modelId, systemPrompt, userPrompt, options) {
    console.log(`🤖 Making OpenAI API call for model: ${modelId}`);
    
    // o3 is a reasoning model and might need special parameters
    const requestConfig = {
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    };
    
    // Add reasoning-specific parameters for o3 and o3-pro
    if (modelId.startsWith('o3')) {
      console.log(`🧠 Using reasoning model: ${modelId} - accounting for reasoning tokens`);
      // For o3, set a much higher limit to account for reasoning tokens
      requestConfig.max_completion_tokens = Math.max(2000, options.maxTokens * 3); // Allow 3x for reasoning overhead
      // o3 only supports temperature=1 (default), so don't set temperature parameter
      console.log(`🧠 o3 using default temperature (1.0), ignoring user setting of ${options.temperature}`);
      console.log(`🧠 o3 max_completion_tokens set to: ${requestConfig.max_completion_tokens} (accounting for reasoning)`);
      // Set reasoning effort to low to prioritize completion content over reasoning
      requestConfig.reasoning_effort = "low"; // Available values: "low", "medium", "high"
    } else {
      requestConfig.max_tokens = options.maxTokens; // Standard models use max_tokens
      requestConfig.temperature = options.temperature; // Standard models support custom temperature
    }
    
    console.log(`📤 Request config:`, JSON.stringify(requestConfig, null, 2));
    
    const response = await this.openai.chat.completions.create(requestConfig);
    
    console.log(`📥 Response received for ${modelId}:`, {
      choices: response.choices?.length,
      usage: response.usage,
      finishReason: response.choices?.[0]?.finish_reason
    });

    // Separate reasoning tokens from completion tokens for o3
    const usage = { ...response.usage };
    if (modelId.startsWith('o3') && usage.completion_tokens_details?.reasoning_tokens) {
      console.log(`🧠 o3 reasoning tokens tracked separately: ${usage.completion_tokens_details.reasoning_tokens}`);
      usage.reasoning_tokens = usage.completion_tokens_details.reasoning_tokens;
      // Keep original completion_tokens as is - they already exclude reasoning tokens in o3
    }

    const content = response.choices[0].message.content;
    console.log(`📝 Response content length:`, content?.length || 0);
    
    if (!content || content.length === 0) {
      console.log(`❌ Empty content detected for ${modelId}`);
      console.log(`📝 Response message:`, JSON.stringify(response.choices[0].message, null, 2));
      console.log(`📝 Full response:`, JSON.stringify(response, null, 2));
      
      // Check for any safety issues
      if (response.choices[0].message.refusal) {
        console.log(`🚫 Content was refused: ${response.choices[0].message.refusal}`);
      }
    }

    return {
      content: content,
      model: modelId,
      usage: usage,
      finishReason: response.choices[0].finish_reason
    };
  }

  async generateAnthropicResponse(modelId, systemPrompt, userPrompt, options) {
    const response = await this.anthropic.messages.create({
      model: modelId,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    return {
      content: response.content[0].text,
      model: modelId,
      usage: response.usage,
      stopReason: response.stop_reason
    };
  }

  async generateMultipleResponses(systemPrompt, userPrompt, modelIds, options = {}) {
    const promises = modelIds.map(modelId => 
      this.generateResponse(modelId, systemPrompt, userPrompt, options)
    );

    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const modelName = this.models.find(m => m.id === modelIds[index])?.name || modelIds[index];
        return {
          content: `Error: ${result.reason.message}`,
          model: modelName,
          error: true
        };
      }
    });
  }

  async generateMultipleResponsesWithHistory(messages, modelIds, options = {}) {
    const startTime = Date.now();
    let traceId = null;
    
    // Track generation request with MLFlow
    if (this.mlflowTracer) {
      try {
        traceId = await this.mlflowTracer.trackGeneration({
          binId: options.binId || 'local-dev',
          systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
          messages: messages,
          models: modelIds,
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 1000
        });
      } catch (error) {
        console.warn('MLFlow tracking failed:', error.message);
      }
    }
    
    const promises = modelIds.map(modelId => 
      this.generateResponseWithHistory(modelId, messages, options)
    );

    const results = await Promise.allSettled(promises);
    
    const responses = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const modelName = this.models.find(m => m.id === modelIds[index])?.name || modelIds[index];
        return {
          content: `Error: ${result.reason.message}`,
          model: modelName,
          error: true
        };
      }
    });
    
    // Track generation response with MLFlow
    if (this.mlflowTracer && traceId) {
      try {
        const duration = Date.now() - startTime;
        await this.mlflowTracer.trackGenerationResponse(traceId, responses, duration);
      } catch (error) {
        console.warn('MLFlow response tracking failed:', error.message);
      }
    }
    
    return responses;
  }

  async generateResponseWithHistory(modelId, messages, options = {}) {
    const model = this.models.find(m => m.id === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const temperature = options.temperature || 0.7;
    const maxTokens = options.maxTokens || 1000;

    try {
      if (model.provider === 'openai') {
        return await this.generateOpenAIResponseWithHistory(model.id, messages, { temperature, maxTokens });
      } else if (model.provider === 'anthropic') {
        return await this.generateAnthropicResponseWithHistory(model.id, messages, { temperature, maxTokens });
      } else if (model.provider === 'google') {
        return await this.generateGoogleResponseWithHistory(model.id, messages, { temperature, maxTokens });
      }
    } catch (error) {
      console.error(`❌ Error with ${model.name} (${modelId}):`, error);
      console.error(`❌ Error details:`, {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        response: error.response?.data,
        stack: error.stack
      });
      
      return {
        content: `Error with ${model.name}: ${error.message}${error.status ? ` (Status: ${error.status})` : ''}`,
        model: model.name,
        error: true
      };
    }
  }

  async generateOpenAIResponseWithHistory(modelId, messages, options) {
    console.log(`🤖 Making OpenAI API call with history for model: ${modelId}`);
    
    const requestConfig = {
      model: modelId,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };
    
    // Add reasoning-specific parameters for o3 and o3-pro
    if (modelId.startsWith('o3')) {
      console.log(`🧠 Using reasoning model with history: ${modelId} - accounting for reasoning tokens`);
      // For o3, set a much higher limit to account for reasoning tokens
      requestConfig.max_completion_tokens = Math.max(2000, options.maxTokens * 3); // Allow 3x for reasoning overhead
      // o3 only supports temperature=1 (default), so don't set temperature parameter
      console.log(`🧠 o3 using default temperature (1.0), ignoring user setting of ${options.temperature}`);
      console.log(`🧠 o3 max_completion_tokens set to: ${requestConfig.max_completion_tokens} (accounting for reasoning)`);
      // Set reasoning effort to low to prioritize completion content over reasoning
      requestConfig.reasoning_effort = "low"; // Available values: "low", "medium", "high"
    } else {
      requestConfig.max_tokens = options.maxTokens; // Standard models use max_tokens
      requestConfig.temperature = options.temperature; // Standard models support custom temperature
    }
    
    console.log(`📤 Request config:`, JSON.stringify(requestConfig, null, 2));
    
    const response = await this.openai.chat.completions.create(requestConfig);
    
    console.log(`📥 Response received for ${modelId}:`, {
      choices: response.choices?.length,
      usage: response.usage,
      finishReason: response.choices?.[0]?.finish_reason
    });

    // Separate reasoning tokens from completion tokens for o3
    const usage = { ...response.usage };
    if (modelId.startsWith('o3') && usage.completion_tokens_details?.reasoning_tokens) {
      console.log(`🧠 o3 reasoning tokens tracked separately: ${usage.completion_tokens_details.reasoning_tokens}`);
      usage.reasoning_tokens = usage.completion_tokens_details.reasoning_tokens;
      // Keep original completion_tokens as is - they already exclude reasoning tokens in o3
    }

    const content = response.choices[0].message.content;
    console.log(`📝 Response content length:`, content?.length || 0);
    
    if (!content || content.length === 0) {
      console.log(`❌ Empty content detected for ${modelId}`);
      console.log(`📝 Response message:`, JSON.stringify(response.choices[0].message, null, 2));
      console.log(`📝 Full response:`, JSON.stringify(response, null, 2));
      
      // Check for any safety issues
      if (response.choices[0].message.refusal) {
        console.log(`🚫 Content was refused: ${response.choices[0].message.refusal}`);
      }
    }

    return {
      content: content,
      model: modelId,
      usage: usage,
      finishReason: response.choices[0].finish_reason
    };
  }

  async generateAnthropicResponseWithHistory(modelId, messages, options) {
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await this.anthropic.messages.create({
      model: modelId,
      system: systemMessage?.content || '',
      messages: conversationMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    return {
      content: response.content[0].text,
      model: modelId,
      usage: response.usage,
      stopReason: response.stop_reason
    };
  }

  async generateGoogleResponse(modelId, systemPrompt, userPrompt, options) {
    console.log(`🤖 Making Google API call for model: ${modelId}`);
    
    const model = this.google.getGenerativeModel({ model: modelId });
    
    const prompt = `${systemPrompt}\n\nUser: ${userPrompt}`;
    
    const requestConfig = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: Math.max(2000, options.maxTokens * 3), // Account for internal reasoning tokens
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH", 
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH"
        }
      ]
    };
    
    console.log(`📤 Google API request config:`, JSON.stringify(requestConfig, null, 2));
    
    const result = await model.generateContent(requestConfig);

    const response = await result.response;
    
    console.log(`📥 Google API response:`, {
      usageMetadata: response.usageMetadata,
      candidates: response.candidates?.length,
      finishReason: response.candidates?.[0]?.finishReason,
      candidateText: response.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 100) + '...'
    });
    
    // Handle Google's usageMetadata structure properly  
    const usageMetadata = response.usageMetadata || {};
    // Calculate actual output tokens as total - prompt - reasoning
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || 0;
    const reasoningTokens = usageMetadata.thoughtsTokenCount || 0;
    const completionTokens = Math.max(0, totalTokens - promptTokens - reasoningTokens);
    
    const usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens, // Calculated: total - prompt - reasoning
      total_tokens: totalTokens,
      reasoning_tokens: reasoningTokens // Track separately for visibility
    };
    
    console.log(`📊 Processed usage:`, usage);
    
    let content;
    try {
      content = response.text();
    } catch (error) {
      console.log(`❌ Error extracting text:`, error);
      // Try alternative extraction methods
      if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        content = response.candidates[0].content.parts[0].text;
      } else if (response.candidates?.[0]?.content?.text) {
        content = response.candidates[0].content.text;
      } else {
        content = '';
        console.log(`❌ No text found in response structure`);
      }
    }
    
    console.log(`📝 Response content length:`, content?.length || 0);
    if (!content && response.candidates?.[0]) {
      console.log(`📝 Candidate structure:`, JSON.stringify(response.candidates[0], null, 2));
      
      // Check for safety filtering
      if (response.candidates[0].finishReason === 'SAFETY') {
        console.log(`🚫 Gemini response blocked due to safety filters`);
      } else if (response.candidates[0].finishReason === 'MAX_TOKENS') {
        console.log(`⚠️ Gemini response hit max tokens but has no content - possible filtering`);
      } else if (response.candidates[0].finishReason === 'RECITATION') {
        console.log(`📚 Gemini response blocked due to recitation concerns`);
      }
    }
    
    return {
      content: content,
      model: modelId,
      usage: usage,
      finishReason: response.candidates?.[0]?.finishReason
    };
  }

  async generateGoogleResponseWithHistory(modelId, messages, options) {
    const model = this.google.getGenerativeModel({ model: modelId });
    
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    
    let prompt = systemMessage ? `${systemMessage.content}\n\n` : '';
    prompt += conversationMessages.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: Math.max(2000, options.maxTokens * 3), // Account for internal reasoning tokens
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH", 
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_ONLY_HIGH"
        }
      ]
    });

    const response = await result.response;
    
    // Handle Google's usageMetadata structure properly  
    const usageMetadata = response.usageMetadata || {};
    // Calculate actual output tokens as total - prompt - reasoning
    const promptTokens = usageMetadata.promptTokenCount || 0;
    const totalTokens = usageMetadata.totalTokenCount || 0;
    const reasoningTokens = usageMetadata.thoughtsTokenCount || 0;
    const completionTokens = Math.max(0, totalTokens - promptTokens - reasoningTokens);
    
    const usage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens, // Calculated: total - prompt - reasoning
      total_tokens: totalTokens,
      reasoning_tokens: reasoningTokens // Track separately for visibility
    };
    
    console.log(`📊 Processed usage (with history):`, usage);
    
    return {
      content: response.text(),
      model: modelId,
      usage: usage,
      finishReason: response.candidates?.[0]?.finishReason
    };
  }
}