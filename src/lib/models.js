import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class ModelManager {
  constructor() {
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
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
        { name: 'GPT-o3', id: 'o3-2025-04-16', provider: 'openai' }
      );
    }

    if (this.anthropic) {
      models.push(
        { name: 'Claude Opus 4', id: 'claude-opus-4-20250514', provider: 'anthropic' },
        { name: 'Claude Sonnet 4', id: 'claude-sonnet-4-20250514', provider: 'anthropic' }
      );
    }

    if (this.google) {
      models.push(
        { name: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro', provider: 'google' }
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
      console.error(`Error with ${model.name}:`, error.message);
      return {
        content: `Error: ${error.message}`,
        model: model.name,
        error: true
      };
    }
  }

  async generateOpenAIResponse(modelId, systemPrompt, userPrompt, options) {
    const response = await this.openai.chat.completions.create({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    return {
      content: response.choices[0].message.content,
      model: modelId,
      usage: response.usage,
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
    const promises = modelIds.map(modelId => 
      this.generateResponseWithHistory(modelId, messages, options)
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
      console.error(`Error with ${model.name}:`, error.message);
      return {
        content: `Error: ${error.message}`,
        model: model.name,
        error: true
      };
    }
  }

  async generateOpenAIResponseWithHistory(modelId, messages, options) {
    const response = await this.openai.chat.completions.create({
      model: modelId,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    return {
      content: response.choices[0].message.content,
      model: modelId,
      usage: response.usage,
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
    const model = this.google.getGenerativeModel({ model: modelId });
    
    const prompt = `${systemPrompt}\n\nUser: ${userPrompt}`;
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
      },
    });

    const response = await result.response;
    return {
      content: response.text(),
      model: modelId,
      usage: response.usageMetadata || {},
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
        maxOutputTokens: options.maxTokens,
      },
    });

    const response = await result.response;
    return {
      content: response.text(),
      model: modelId,
      usage: response.usageMetadata || {},
      finishReason: response.candidates?.[0]?.finishReason
    };
  }
}