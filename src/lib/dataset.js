import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export class DatasetManager {
  constructor(filename = 'dataset.jsonl') {
    this.filename = filename;
    this.dataset = [];
    this.metadata = {
      created: new Date().toISOString(),
      totalExamples: 0,
      models: new Set(),
      personas: new Set()
    };
  }

  async load() {
    try {
      const data = await fs.readFile(this.filename, 'utf-8');
      const lines = data.trim().split('\n').filter(line => line.trim());
      
      this.dataset = lines.map(line => JSON.parse(line));
      this.updateMetadata();
      
      return this.dataset.length;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      return 0;
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    
    const jsonlContent = this.dataset
      .map(example => JSON.stringify(example))
      .join('\n');
    
    await fs.writeFile(this.filename, jsonlContent);
    
    const metadataPath = this.filename.replace('.jsonl', '_metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(this.metadata, null, 2));
  }

  addExample(systemPrompt, userPrompt, assistantResponse, metadata = {}) {
    const example = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: assistantResponse }
      ],
      metadata: {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        model: metadata.model,
        persona: metadata.persona,
        temperature: metadata.temperature,
        tokens: metadata.tokens,
        type: 'single-turn',
        ...metadata
      }
    };

    this.dataset.push(example);
    this.updateMetadata();
    
    return example.metadata.id;
  }

  addConversation(messages, metadata = {}) {
    const example = {
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      metadata: {
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        type: 'multi-turn',
        turnCount: messages.filter(m => m.role === 'user').length,
        ...metadata
      }
    };

    this.dataset.push(example);
    this.updateMetadata();
    
    return example.metadata.id;
  }

  removeExample(id) {
    const index = this.dataset.findIndex(ex => ex.metadata.id === id);
    if (index !== -1) {
      this.dataset.splice(index, 1);
      this.updateMetadata();
      return true;
    }
    return false;
  }

  getExample(id) {
    return this.dataset.find(ex => ex.metadata.id === id);
  }

  getAllExamples() {
    return [...this.dataset];
  }

  getStats() {
    const stats = {
      total: this.dataset.length,
      models: {},
      personas: {},
      avgTokens: 0,
      dateRange: {
        oldest: null,
        newest: null
      }
    };

    if (this.dataset.length === 0) {
      return stats;
    }

    let totalTokens = 0;
    const timestamps = [];

    for (const example of this.dataset) {
      const { model, persona, tokens, timestamp } = example.metadata;
      
      if (model) {
        stats.models[model] = (stats.models[model] || 0) + 1;
      }
      
      if (persona) {
        stats.personas[persona] = (stats.personas[persona] || 0) + 1;
      }
      
      if (tokens) {
        totalTokens += tokens;
      }
      
      if (timestamp) {
        timestamps.push(new Date(timestamp));
      }
    }

    stats.avgTokens = Math.round(totalTokens / this.dataset.length);
    
    if (timestamps.length > 0) {
      timestamps.sort();
      stats.dateRange.oldest = timestamps[0].toISOString();
      stats.dateRange.newest = timestamps[timestamps.length - 1].toISOString();
    }

    return stats;
  }

  async deduplicate(threshold = 0.8) {
    const duplicates = [];
    const seen = new Set();

    for (let i = 0; i < this.dataset.length; i++) {
      const example = this.dataset[i];
      const userContent = example.messages.find(m => m.role === 'user')?.content || '';
      const assistantContent = example.messages.find(m => m.role === 'assistant')?.content || '';
      
      const hash = this.generateContentHash(userContent + assistantContent);
      
      if (seen.has(hash)) {
        duplicates.push(i);
      } else {
        seen.add(hash);
      }
    }

    for (let i = duplicates.length - 1; i >= 0; i--) {
      this.dataset.splice(duplicates[i], 1);
    }

    this.updateMetadata();
    return duplicates.length;
  }

  validateExamples() {
    const issues = [];

    for (let i = 0; i < this.dataset.length; i++) {
      const example = this.dataset[i];
      const exampleIssues = [];

      if (!example.messages || !Array.isArray(example.messages)) {
        exampleIssues.push('Missing or invalid messages array');
      } else {
        const requiredRoles = ['system', 'user', 'assistant'];
        const foundRoles = example.messages.map(m => m.role);
        
        for (const role of requiredRoles) {
          if (!foundRoles.includes(role)) {
            exampleIssues.push(`Missing ${role} message`);
          }
        }

        for (const message of example.messages) {
          if (!message.content || message.content.trim().length === 0) {
            exampleIssues.push(`Empty content in ${message.role} message`);
          }
          
          if (message.content && message.content.length > 10000) {
            exampleIssues.push(`Very long content in ${message.role} message (${message.content.length} chars)`);
          }
        }
      }

      if (exampleIssues.length > 0) {
        issues.push({
          index: i,
          id: example.metadata?.id,
          issues: exampleIssues
        });
      }
    }

    return issues;
  }

  updateMetadata() {
    this.metadata.totalExamples = this.dataset.length;
    this.metadata.models = new Set(
      this.dataset.map(ex => ex.metadata?.model).filter(Boolean)
    );
    this.metadata.personas = new Set(
      this.dataset.map(ex => ex.metadata?.persona).filter(Boolean)
    );
    this.metadata.lastUpdated = new Date().toISOString();
  }

  generateId() {
    return crypto.randomBytes(8).toString('hex');
  }

  generateContentHash(content) {
    return crypto.createHash('sha256').update(content.toLowerCase().trim()).digest('hex');
  }

  async exportForFineTuning(outputPath) {
    const finetuneData = this.dataset.map(example => ({
      messages: example.messages
    }));

    const content = finetuneData.map(item => JSON.stringify(item)).join('\n');
    await fs.writeFile(outputPath, content);
    
    return finetuneData.length;
  }
}