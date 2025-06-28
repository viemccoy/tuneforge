// TuneForge Cloudflare Edition
class TuneForgeCloudflare {
    constructor() {
        this.authenticated = false;
        this.currentBin = null;
        this.bins = [];
        this.conversations = [];
        this.currentConversation = [];
        this.selectedModels = [];
        this.availableModels = [];
        this.activeLoom = null;
        this.activeCompletionIndex = 0;
        
        this.apiBase = '/api';
        
        this.initializeAuth();
    }
    
    async initializeAuth() {
        // Check if already authenticated
        try {
            const response = await fetch(`${this.apiBase}/bins`);
            if (response.ok) {
                this.authenticated = true;
                this.hideAuthModal();
                this.initialize();
            } else {
                this.showAuthModal();
            }
        } catch (error) {
            this.showAuthModal();
        }
        
        // Auth form handler
        document.getElementById('authSubmit').addEventListener('click', () => this.authenticate());
        document.getElementById('authPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.authenticate();
        });
    }
    
    async authenticate() {
        const password = document.getElementById('authPassword').value;
        const errorEl = document.getElementById('authError');
        
        try {
            const response = await fetch(`${this.apiBase}/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.authenticated = true;
                this.hideAuthModal();
                this.initialize();
            } else {
                errorEl.textContent = 'Invalid password';
                document.getElementById('authPassword').value = '';
            }
        } catch (error) {
            errorEl.textContent = 'Authentication failed';
        }
    }
    
    showAuthModal() {
        document.getElementById('authModal').classList.add('active');
        document.getElementById('authPassword').focus();
    }
    
    hideAuthModal() {
        document.getElementById('authModal').classList.remove('active');
    }
    
    async initialize() {
        console.log('Initializing TuneForge Cloudflare Edition...');
        
        this.initializeEventListeners();
        this.setupKeyboardNavigation();
        await this.loadBins();
        await this.loadModels();
    }
    
    initializeEventListeners() {
        // Bin management
        document.getElementById('createBin').addEventListener('click', () => this.showCreateBinModal());
        document.getElementById('confirmCreateBin').addEventListener('click', () => this.createBin());
        document.getElementById('exportBin').addEventListener('click', () => this.exportBin());
        document.getElementById('deleteBin').addEventListener('click', () => this.deleteBin());
        
        // Conversation controls
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('newConversation').addEventListener('click', () => this.startNewConversation());
        document.getElementById('saveConversation').addEventListener('click', () => this.saveConversation());
        document.getElementById('viewConversations').addEventListener('click', () => this.showConversationsModal());
        
        // Model selection
        document.getElementById('selectAllModels').addEventListener('click', () => this.selectAllModels());
        
        // Parameters
        document.getElementById('temperature').addEventListener('input', (e) => {
            document.getElementById('temperatureValue').textContent = e.target.value;
        });
        
        document.getElementById('maxTokens').addEventListener('input', (e) => {
            document.getElementById('maxTokensValue').textContent = e.target.value;
        });
        
        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });
        
        // Enter key in message input
        document.getElementById('userMessage').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }
    
    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                return;
            }
            
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
            
            // Arrow key navigation for completions
            if (this.activeLoom && this.activeLoom.responses.length > 0) {
                switch (e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.navigateCompletion(-1);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.navigateCompletion(1);
                        break;
                    case 'Enter':
                        e.preventDefault();
                        this.selectCurrentCompletion();
                        break;
                }
            }
        });
    }
    
    async loadBins() {
        try {
            const response = await fetch(`${this.apiBase}/bins`);
            const data = await response.json();
            this.bins = data.bins || [];
            this.renderBinList();
        } catch (error) {
            console.error('Failed to load bins:', error);
        }
    }
    
    async loadModels() {
        // In Cloudflare version, models are defined in the edge function
        // For now, we'll use a static list
        this.availableModels = [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
            { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
            { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic' }
        ];
        this.renderModelSelector();
    }
    
    renderBinList() {
        const binList = document.getElementById('binList');
        binList.innerHTML = '';
        
        if (this.bins.length === 0) {
            binList.innerHTML = '<div class="empty-state">No bins created yet</div>';
            return;
        }
        
        this.bins.forEach(bin => {
            const binEl = document.createElement('div');
            binEl.className = 'bin-item' + (this.currentBin?.id === bin.id ? ' active' : '');
            binEl.innerHTML = `
                <div class="bin-name">${bin.name}</div>
                <div class="bin-meta">${bin.conversationCount || 0} conversations</div>
            `;
            binEl.addEventListener('click', () => this.selectBin(bin));
            binList.appendChild(binEl);
        });
    }
    
    renderModelSelector() {
        const selector = document.getElementById('modelSelector');
        selector.innerHTML = '';
        
        this.availableModels.forEach(model => {
            const modelEl = document.createElement('div');
            modelEl.className = 'model-option';
            modelEl.innerHTML = `
                <input type="checkbox" id="model-${model.id}" value="${model.id}">
                <label for="model-${model.id}">${model.name}</label>
            `;
            modelEl.addEventListener('click', () => this.toggleModelSelection(model.id));
            selector.appendChild(modelEl);
        });
    }
    
    async selectBin(bin) {
        this.currentBin = bin;
        
        // Update UI
        document.getElementById('currentBinName').textContent = bin.name;
        document.getElementById('selectedBinName').textContent = bin.name;
        document.getElementById('binCreated').textContent = new Date(bin.createdAt).toLocaleDateString();
        document.getElementById('binUpdated').textContent = new Date(bin.lastUpdated).toLocaleDateString();
        
        // Show bin actions and chat interface
        document.getElementById('binActions').style.display = 'block';
        document.getElementById('noBinMessage').style.display = 'none';
        document.getElementById('chatArea').style.display = 'flex';
        document.getElementById('rightPanel').style.display = 'flex';
        document.getElementById('mainWrapper').classList.remove('no-bin');
        
        // Load conversations for this bin
        await this.loadConversations();
        
        // Update bin list UI
        this.renderBinList();
        
        // Clear current conversation
        this.startNewConversation();
    }
    
    async loadConversations() {
        if (!this.currentBin) return;
        
        try {
            const response = await fetch(`${this.apiBase}/conversations?binId=${this.currentBin.id}`);
            const data = await response.json();
            this.conversations = data.conversations || [];
            document.getElementById('conversationCount').textContent = this.conversations.length;
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    }
    
    showCreateBinModal() {
        document.getElementById('createBinModal').classList.add('active');
        document.getElementById('binName').focus();
    }
    
    async createBin() {
        const name = document.getElementById('binName').value;
        const systemPrompt = document.getElementById('binSystemPrompt').value;
        const description = document.getElementById('binDescription').value;
        
        if (!name || !systemPrompt) {
            alert('Name and system prompt are required');
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBase}/bins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, systemPrompt, description })
            });
            
            if (response.ok) {
                const bin = await response.json();
                this.bins.push(bin);
                this.renderBinList();
                document.getElementById('createBinModal').classList.remove('active');
                
                // Clear form
                document.getElementById('binName').value = '';
                document.getElementById('binSystemPrompt').value = '';
                document.getElementById('binDescription').value = '';
                
                // Select the new bin
                this.selectBin(bin);
            } else {
                const error = await response.text();
                console.error('Failed to create bin:', response.status, error);
                alert(`Failed to create bin: ${response.status} - ${error}`);
            }
        } catch (error) {
            console.error('Failed to create bin:', error);
            alert('Failed to create bin');
        }
    }
    
    async deleteBin() {
        if (!this.currentBin) return;
        
        if (!confirm(`Delete bin "${this.currentBin.name}" and all its conversations?`)) {
            return;
        }
        
        try {
            const response = await fetch(`${this.apiBase}/bins/${this.currentBin.id}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.bins = this.bins.filter(b => b.id !== this.currentBin.id);
                this.currentBin = null;
                this.renderBinList();
                
                // Reset UI
                document.getElementById('currentBinName').textContent = 'NO BIN SELECTED';
                document.getElementById('conversationCount').textContent = '0';
                document.getElementById('binActions').style.display = 'none';
                document.getElementById('chatArea').style.display = 'none';
                document.getElementById('noBinMessage').style.display = 'flex';
                document.getElementById('rightPanel').style.display = 'none';
                document.getElementById('mainWrapper').classList.add('no-bin');
            }
        } catch (error) {
            console.error('Failed to delete bin:', error);
            alert('Failed to delete bin');
        }
    }
    
    async exportBin() {
        if (!this.currentBin) return;
        
        window.location.href = `${this.apiBase}/export?binId=${this.currentBin.id}`;
    }
    
    toggleModelSelection(modelId) {
        const checkbox = document.getElementById(`model-${modelId}`);
        checkbox.checked = !checkbox.checked;
        
        if (checkbox.checked) {
            this.selectedModels.push(modelId);
        } else {
            this.selectedModels = this.selectedModels.filter(id => id !== modelId);
        }
    }
    
    selectAllModels() {
        this.selectedModels = this.availableModels.map(m => m.id);
        this.availableModels.forEach(model => {
            document.getElementById(`model-${model.id}`).checked = true;
        });
    }
    
    startNewConversation() {
        this.currentConversation = [];
        document.getElementById('conversationContainer').innerHTML = '';
        document.getElementById('userMessage').value = '';
        document.getElementById('saveConversation').disabled = true;
        this.activeLoom = null;
    }
    
    async sendMessage() {
        if (!this.currentBin) {
            alert('Please select a bin first');
            return;
        }
        
        const userMessage = document.getElementById('userMessage').value.trim();
        if (!userMessage) return;
        
        if (this.selectedModels.length === 0) {
            alert('Please select at least one model');
            return;
        }
        
        // Add user message to conversation
        this.currentConversation.push({ role: 'user', content: userMessage });
        this.renderMessage({ role: 'user', content: userMessage });
        
        // Clear input
        document.getElementById('userMessage').value = '';
        
        // Generate responses
        await this.generateResponses(userMessage);
    }
    
    async generateResponses(userMessage) {
        const temperature = parseFloat(document.getElementById('temperature').value);
        const maxTokens = parseInt(document.getElementById('maxTokens').value);
        
        // Create loom for responses
        const loomId = `loom-${Date.now()}`;
        const loomEl = document.createElement('div');
        loomEl.className = 'completion-loom';
        loomEl.id = loomId;
        loomEl.innerHTML = '<div class="loom-loading">Generating responses...</div>';
        document.getElementById('conversationContainer').appendChild(loomEl);
        
        try {
            // Call the edge function to generate responses
            const response = await fetch(`${this.apiBase}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    binId: this.currentBin.id,
                    systemPrompt: this.currentBin.systemPrompt,
                    messages: this.currentConversation,
                    models: this.selectedModels,
                    temperature,
                    maxTokens
                })
            });
            
            const data = await response.json();
            
            if (data.responses) {
                this.activeLoom = {
                    id: loomId,
                    responses: data.responses
                };
                this.activeCompletionIndex = 0;
                this.renderCompletionLoom(loomEl, data.responses);
            }
        } catch (error) {
            console.error('Failed to generate responses:', error);
            loomEl.innerHTML = '<div class="error">Failed to generate responses</div>';
        }
    }
    
    renderMessage(message) {
        const container = document.getElementById('conversationContainer');
        const messageEl = document.createElement('div');
        messageEl.className = `message ${message.role}`;
        messageEl.innerHTML = `
            <div class="message-role">${message.role.toUpperCase()}</div>
            <div class="message-content">${this.escapeHtml(message.content)}</div>
        `;
        container.appendChild(messageEl);
        container.scrollTop = container.scrollHeight;
    }
    
    renderCompletionLoom(loomEl, responses) {
        loomEl.innerHTML = `
            <div class="loom-header">
                <span class="loom-title">SELECT COMPLETION (${responses.length} responses)</span>
                <span class="loom-navigation">← → arrows to navigate, Enter to select</span>
            </div>
            <div class="loom-responses"></div>
        `;
        
        const responsesContainer = loomEl.querySelector('.loom-responses');
        
        responses.forEach((response, index) => {
            const responseEl = document.createElement('div');
            responseEl.className = 'loom-response' + (index === this.activeCompletionIndex ? ' active' : '');
            responseEl.innerHTML = `
                <div class="response-header">
                    <span class="response-model">${response.model}${response.edited ? ' <span class="edited-badge">(edited)</span>' : ''}</span>
                    <div class="response-actions">
                        <button class="btn-icon edit-btn" data-index="${index}" title="Edit response">✏️</button>
                        ${response.usage ? `<span class="response-tokens">${response.usage.total_tokens} tokens</span>` : ''}
                    </div>
                </div>
                <div class="response-content" id="response-content-${index}">${this.escapeHtml(response.content || response.error || 'No response')}</div>
                <div class="response-editor" id="response-editor-${index}" style="display: none;">
                    <textarea class="edit-textarea" id="edit-textarea-${index}">${response.content || ''}</textarea>
                    <div class="edit-actions">
                        <button class="btn-compact btn-primary save-edit" data-index="${index}">SAVE</button>
                        <button class="btn-compact cancel-edit" data-index="${index}">CANCEL</button>
                    </div>
                </div>
            `;
            
            // Click on response content to select
            const contentEl = responseEl.querySelector('.response-content');
            contentEl.addEventListener('click', () => this.selectCompletion(response, index));
            
            // Edit button handler
            const editBtn = responseEl.querySelector('.edit-btn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startEditingResponse(index);
            });
            
            // Save edit handler
            const saveBtn = responseEl.querySelector('.save-edit');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.saveEditedResponse(index);
                });
            }
            
            // Cancel edit handler
            const cancelBtn = responseEl.querySelector('.cancel-edit');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.cancelEditingResponse(index);
                });
            }
            responsesContainer.appendChild(responseEl);
        });
    }
    
    startEditingResponse(index) {
        // Hide content, show editor
        document.getElementById(`response-content-${index}`).style.display = 'none';
        document.getElementById(`response-editor-${index}`).style.display = 'block';
        
        // Focus textarea
        const textarea = document.getElementById(`edit-textarea-${index}`);
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    
    saveEditedResponse(index) {
        const textarea = document.getElementById(`edit-textarea-${index}`);
        const newContent = textarea.value;
        
        // Update the response in our data
        if (this.activeLoom && this.activeLoom.responses[index]) {
            this.activeLoom.responses[index].content = newContent;
            this.activeLoom.responses[index].edited = true;
        }
        
        // Update the display
        document.getElementById(`response-content-${index}`).innerHTML = this.escapeHtml(newContent);
        
        // Hide editor, show content
        document.getElementById(`response-content-${index}`).style.display = 'block';
        document.getElementById(`response-editor-${index}`).style.display = 'none';
    }
    
    cancelEditingResponse(index) {
        // Restore original content
        const textarea = document.getElementById(`edit-textarea-${index}`);
        if (this.activeLoom && this.activeLoom.responses[index]) {
            textarea.value = this.activeLoom.responses[index].content || '';
        }
        
        // Hide editor, show content
        document.getElementById(`response-content-${index}`).style.display = 'block';
        document.getElementById(`response-editor-${index}`).style.display = 'none';
    }
    
    navigateCompletion(direction) {
        if (!this.activeLoom) return;
        
        const maxIndex = this.activeLoom.responses.length - 1;
        this.activeCompletionIndex = Math.max(0, Math.min(maxIndex, this.activeCompletionIndex + direction));
        
        // Update UI
        const loomEl = document.getElementById(this.activeLoom.id);
        const responses = loomEl.querySelectorAll('.loom-response');
        responses.forEach((el, index) => {
            el.classList.toggle('active', index === this.activeCompletionIndex);
        });
    }
    
    selectCurrentCompletion() {
        if (!this.activeLoom) return;
        const response = this.activeLoom.responses[this.activeCompletionIndex];
        this.selectCompletion(response, this.activeCompletionIndex);
    }
    
    selectCompletion(response, index) {
        if (!response || response.error) return;
        
        // Add to conversation
        this.currentConversation.push({ role: 'assistant', content: response.content });
        
        // Replace loom with message
        const loomEl = document.getElementById(this.activeLoom.id);
        const messageEl = document.createElement('div');
        messageEl.className = 'message assistant';
        messageEl.innerHTML = `
            <div class="message-role">ASSISTANT (${response.model})</div>
            <div class="message-content">${this.escapeHtml(response.content)}</div>
        `;
        loomEl.replaceWith(messageEl);
        
        // Clear active loom
        this.activeLoom = null;
        
        // Enable save button
        document.getElementById('saveConversation').disabled = false;
        
        // Focus input for next message
        document.getElementById('userMessage').focus();
    }
    
    async saveConversation() {
        if (!this.currentBin || this.currentConversation.length < 2) return;
        
        // Add system prompt as first message
        const messages = [
            { role: 'system', content: this.currentBin.systemPrompt },
            ...this.currentConversation
        ];
        
        try {
            const response = await fetch(`${this.apiBase}/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    binId: this.currentBin.id,
                    messages,
                    metadata: {
                        model: this.currentConversation[this.currentConversation.length - 1].model
                    }
                })
            });
            
            if (response.ok) {
                // Update conversation count
                await this.loadConversations();
                
                // Show success message
                this.showNotification('Conversation saved to dataset');
                
                // Start new conversation
                this.startNewConversation();
            }
        } catch (error) {
            console.error('Failed to save conversation:', error);
            alert('Failed to save conversation');
        }
    }
    
    showConversationsModal() {
        if (!this.currentBin) return;
        
        document.getElementById('conversationsModal').classList.add('active');
        
        const list = document.getElementById('conversationsList');
        list.innerHTML = '';
        
        if (this.conversations.length === 0) {
            list.innerHTML = '<div class="empty-state">No conversations in this bin yet</div>';
            return;
        }
        
        this.conversations.forEach(conv => {
            const convEl = document.createElement('div');
            convEl.className = 'conversation-item';
            
            const preview = conv.messages.find(m => m.role === 'user')?.content || 'No preview';
            
            convEl.innerHTML = `
                <div class="conv-header">
                    <span class="conv-date">${new Date(conv.metadata.createdAt).toLocaleString()}</span>
                    <span class="conv-turns">${conv.metadata.turnCount} turns</span>
                </div>
                <div class="conv-preview">${this.escapeHtml(preview.substring(0, 100))}...</div>
            `;
            
            list.appendChild(convEl);
        });
    }
    
    showNotification(message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new TuneForgeCloudflare();
});