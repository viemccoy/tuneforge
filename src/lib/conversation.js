import crypto from 'crypto';

export class ConversationManager {
  constructor() {
    this.conversations = new Map();
  }

  startConversation(systemPrompt) {
    const id = crypto.randomBytes(8).toString('hex');
    
    this.conversations.set(id, {
      id,
      messages: [
        { role: 'system', content: systemPrompt }
      ],
      created: new Date(),
      lastUpdated: new Date()
    });

    return id;
  }

  addMessage(conversationId, role, content) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push({
      role,
      content,
      timestamp: new Date()
    });

    conversation.lastUpdated = new Date();
    return conversation;
  }

  getConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    return conversation;
  }

  getAllConversations() {
    return Array.from(this.conversations.values());
  }

  deleteConversation(conversationId) {
    return this.conversations.delete(conversationId);
  }

  getConversationContext(conversationId) {
    const conversation = this.getConversation(conversationId);
    return conversation.messages;
  }

  getConversationStats(conversationId) {
    const conversation = this.getConversation(conversationId);
    
    const userMessages = conversation.messages.filter(m => m.role === 'user');
    const assistantMessages = conversation.messages.filter(m => m.role === 'assistant');

    return {
      id: conversationId,
      turnCount: userMessages.length,
      totalMessages: conversation.messages.length,
      duration: new Date() - conversation.created,
      lastUpdated: conversation.lastUpdated
    };
  }

  // Format conversation for fine-tuning
  formatForFineTuning(conversationId) {
    const conversation = this.getConversation(conversationId);
    
    return {
      messages: conversation.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };
  }
}