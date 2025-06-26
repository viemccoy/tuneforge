#!/usr/bin/env node

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { ModelManager } from './lib/models.js';
import { PersonaGenerator } from './lib/personas.js';
import { DatasetManager } from './lib/dataset.js';
import { ConversationManager } from './lib/conversation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  connectionStateRecovery: {}
});

const PORT = process.env.PORT || 3001;

// Serve static files
app.use(express.static(join(__dirname, 'web')));
app.use(express.json());

// Main route
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'web', 'index.html'));
});

// API routes
app.get('/api/models', (req, res) => {
  const modelManager = new ModelManager();
  res.json(modelManager.getAvailableModels());
});

app.get('/api/personas', (req, res) => {
  const personaGenerator = new PersonaGenerator();
  res.json(personaGenerator.getAllPersonas());
});

// Socket.io for real-time interaction
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  console.log('Active connections:', io.engine.clientsCount);
  
  const modelManager = new ModelManager();
  const personaGenerator = new PersonaGenerator();
  const datasetManager = new DatasetManager(`datasets/web_session_${Date.now()}.jsonl`);
  const conversationManager = new ConversationManager();

  socket.on('start-session', async (config) => {
    try {
      await datasetManager.load();
      socket.emit('session-started', {
        success: true,
        availableModels: modelManager.getAvailableModels(),
        datasetSize: datasetManager.dataset.length
      });
    } catch (error) {
      socket.emit('session-started', {
        success: false,
        error: error.message
      });
    }
  });

  socket.on('generate-personas', (seedPrompt) => {
    try {
      const variations = personaGenerator.generatePromptVariations(seedPrompt, 5);
      socket.emit('personas-generated', variations);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('start-conversation', async (data) => {
    try {
      const { systemPrompt, userPrompt, selectedModels, options } = data;
      
      // Initialize conversation
      const conversationId = conversationManager.startConversation(systemPrompt);
      conversationManager.addMessage(conversationId, 'user', userPrompt);

      socket.emit('conversation-started', {
        conversationId,
        systemPrompt,
        userPrompt
      });

      // Generate responses from multiple models
      const responses = await modelManager.generateMultipleResponses(
        systemPrompt,
        userPrompt,
        selectedModels,
        options
      );

      socket.emit('responses-generated', {
        conversationId,
        responses
      });

    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('continue-conversation', async (data) => {
    try {
      const { conversationId, selectedResponse, userPrompt, selectedModels, options } = data;
      
      // Add selected response to conversation
      conversationManager.addMessage(conversationId, 'assistant', selectedResponse.content);
      
      // Add new user message
      conversationManager.addMessage(conversationId, 'user', userPrompt);

      // Get full conversation history
      const conversation = conversationManager.getConversation(conversationId);
      
      // Generate responses with full context
      const responses = await modelManager.generateMultipleResponsesWithHistory(
        conversation.messages,
        selectedModels,
        options
      );

      socket.emit('responses-generated', {
        conversationId,
        responses,
        conversation: conversation.messages
      });

    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('save-conversation', async (data) => {
    try {
      const { conversationId, selectedResponse, metadata } = data;
      
      // Add final response to conversation
      conversationManager.addMessage(conversationId, 'assistant', selectedResponse.content);
      
      // Get complete conversation
      const conversation = conversationManager.getConversation(conversationId);
      
      // Save to dataset
      const exampleId = datasetManager.addConversation(
        conversation.messages,
        {
          model: selectedResponse.model,
          conversationId,
          turnCount: conversation.messages.filter(m => m.role === 'user').length,
          ...metadata
        }
      );

      await datasetManager.save();

      socket.emit('conversation-saved', {
        exampleId,
        datasetSize: datasetManager.dataset.length
      });

    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('regenerate-responses', async (data) => {
    try {
      const { userPrompt, selectedModels, options, conversation } = data;
      
      // Use the full conversation context for regeneration
      const responses = await modelManager.generateMultipleResponsesWithHistory(
        conversation,
        selectedModels,
        {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          seed: options.seed,
          systemPromptOverride: options.systemPromptOverride
        }
      );

      // If multiple responses per model requested, generate additional ones
      if (options.responseCount > 1) {
        const additionalResponses = [];
        for (let i = 1; i < options.responseCount; i++) {
          const moreResponses = await modelManager.generateMultipleResponsesWithHistory(
            conversation,
            selectedModels,
            {
              temperature: options.temperature + (Math.random() * 0.2 - 0.1), // Slight temperature variation
              maxTokens: options.maxTokens,
              topP: options.topP,
              frequencyPenalty: options.frequencyPenalty,
              presencePenalty: options.presencePenalty,
              seed: options.seed ? parseInt(options.seed) + i : null
            }
          );
          additionalResponses.push(...moreResponses);
        }
        responses.push(...additionalResponses);
      }

      socket.emit('regeneration-complete', {
        responses: responses,
        originalParams: options
      });

    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('get-stats', async () => {
    try {
      const stats = datasetManager.getStats();
      socket.emit('stats-updated', stats);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Socket.IO debugging
io.engine.on("connection_error", (err) => {
  console.log('❌ Socket.IO connection error:', err.req);
  console.log('❌ Error code:', err.code);
  console.log('❌ Error message:', err.message);
  console.log('❌ Error context:', err.context);
});

io.on('connect_error', (error) => {
  console.log('❌ Socket.IO connect error:', error);
});

server.listen(PORT, () => {
  console.log(`🔥 TuneForge Web Interface running on http://localhost:${PORT}`);
  console.log('🎯 Beautiful dataset builder ready!');
  console.log('🌐 Socket.IO server initialized');
});