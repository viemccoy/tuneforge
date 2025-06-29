// TuneForge Ultimate - Combining Original Power with Bin Management
class TuneForgeUltimate {
    constructor() {
        // Authentication
        this.authenticated = false;
        
        // Bin Management
        this.currentBin = null;
        this.bins = [];
        
        // Original Features
        this.socket = null;
        this.conversations = [];
        this.currentMessages = [];
        this.selectedModels = [];
        this.availableModels = [];
        this.savedPrompts = [];
        this.activeLoom = null;
        this.stats = {
            conversations: 0,
            totalTokens: 0,
            modelUsage: {}
        };
        
        // Cloudflare or Socket.io mode
        this.isCloudflare = window.location.hostname.includes('pages.dev') || 
                          window.location.hostname.includes('cloudflare') ||
                          window.location.hostname.includes('tuneforge.sh');
        
        this.apiBase = this.isCloudflare ? '/api' : '';
        
        this.initializeAuth();
    }
    
    async initializeAuth() {
        if (this.isCloudflare) {
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
        } else {
            // Socket.io mode - no auth needed
            this.authenticated = true;
            this.hideAuthModal();
            this.initialize();
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
        console.log('Initializing TuneForge Ultimate...');
        
        // Initialize UI state
        document.querySelector('.app-container').classList.add('no-bin-selected');
        
        // Setup event listeners
        this.initializeEventListeners();
        this.setupKeyboardShortcuts();
        
        // Initialize connection
        if (!this.isCloudflare) {
            this.initializeSocket();
        } else {
            // In Cloudflare mode, we're connected once authenticated
            document.getElementById('connectionStatus').textContent = 'CONNECTED';
            document.getElementById('connectionDot').classList.add('connected');
        }
        
        // Load initial data
        await this.loadBins();
        await this.loadModels();
        await this.loadSavedPrompts();
        
        // Setup collapsible sections
        this.setupCollapsibles();
    }
    
    initializeEventListeners() {
        // Bin Management
        document.getElementById('createBin').addEventListener('click', () => this.showCreateBinModal());
        document.getElementById('confirmCreateBin').addEventListener('click', () => this.createBin());
        document.getElementById('cancelCreateBin').addEventListener('click', () => {
            document.getElementById('createBinModal').classList.remove('active');
            this.clearBinForm();
        });
        document.getElementById('exportBin').addEventListener('click', () => this.exportBin());
        document.getElementById('deleteBin').addEventListener('click', () => this.deleteBin());
        
        // Conversation Controls
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('newConversation').addEventListener('click', () => this.newConversation());
        document.getElementById('saveConversation').addEventListener('click', () => this.saveConversation());
        document.getElementById('viewConversations').addEventListener('click', () => this.showConversationsModal());
        
        // Model Selection
        document.getElementById('selectAllModels').addEventListener('click', () => this.selectAllModels());
        
        // Parameters
        document.getElementById('temperature').addEventListener('input', (e) => {
            document.getElementById('temperatureValue').textContent = e.target.value;
        });
        
        // Token Controls
        document.querySelector('.token-decrease').addEventListener('click', () => this.adjustTokens(-100));
        document.querySelector('.token-increase').addEventListener('click', () => this.adjustTokens(100));
        
        // Regenerate
        document.getElementById('regenerateLast').addEventListener('click', () => this.showRegenerateModal());
        
        // Export Actions
        document.getElementById('exportDataset').addEventListener('click', () => this.exportDataset('jsonl'));
        document.getElementById('exportCSV').addEventListener('click', () => this.exportDataset('csv'));
        document.getElementById('viewStats').addEventListener('click', () => this.showStatsModal());
        
        // Prompt Management
        document.getElementById('savePrompt').addEventListener('click', () => this.saveSystemPrompt());
        document.getElementById('savedPrompts').addEventListener('change', (e) => this.loadPrompt(e.target.value));
        
        // Modal Close Buttons
        document.querySelectorAll('.modal-close, .close-modal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal').classList.remove('active');
            });
        });
        
        // Regenerate Modal Sliders
        ['regenTemperature', 'regenTopP', 'regenFreqPenalty', 'regenPresPenalty'].forEach(id => {
            const slider = document.getElementById(id);
            const valueId = id.replace('regen', 'regen').replace('Temperature', 'Temp')
                           .replace('TopP', 'TopP').replace('FreqPenalty', 'Freq')
                           .replace('PresPenalty', 'Pres') + 'Value';
            
            slider?.addEventListener('input', (e) => {
                const valueEl = document.getElementById(valueId);
                if (valueEl) valueEl.textContent = e.target.value;
            });
        });
        
        // Prompt Suggestions
        document.querySelectorAll('.prompt-suggestion').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.getElementById('customPromptVariation').value = e.target.dataset.prompt;
            });
        });
        
        // Confirm Regenerate
        document.getElementById('confirmRegenerate').addEventListener('click', () => this.regenerateResponses());
        
        // Enter key in message input
        document.getElementById('userMessage').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                if (e.key === 'Escape') {
                    e.target.blur();
                }
                return;
            }
            
            switch(e.key) {
                case '/':
                    e.preventDefault();
                    document.getElementById('userMessage').focus();
                    break;
                case 'Escape':
                    document.querySelectorAll('.modal.active').forEach(modal => {
                        modal.classList.remove('active');
                    });
                    break;
            }
            
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 'n':
                        e.preventDefault();
                        this.newConversation();
                        break;
                    case 's':
                        e.preventDefault();
                        this.saveConversation();
                        break;
                }
            }
            
            // Loom navigation
            if (this.activeLoom) {
                switch(e.key) {
                    case 'ArrowLeft':
                        e.preventDefault();
                        this.navigateLoom(-1);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        this.navigateLoom(1);
                        break;
                    case 'Enter':
                        e.preventDefault();
                        this.selectLoomResponse();
                        break;
                }
            }
        });
    }
    
    setupCollapsibles() {
        document.getElementById('binSectionToggle').addEventListener('click', (e) => {
            if (e.target.id === 'createBin') return; // Don't toggle when clicking create button
            
            const section = e.target.closest('.sidebar-section');
            section.classList.toggle('collapsed');
        });
    }
    
    initializeSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            document.getElementById('connectionStatus').textContent = 'CONNECTED';
            document.getElementById('connectionDot').classList.add('connected');
            this.loadDataset();
        });
        
        this.socket.on('disconnect', () => {
            document.getElementById('connectionStatus').textContent = 'DISCONNECTED';
            document.getElementById('connectionDot').classList.remove('connected');
        });
        
        this.socket.on('dataset', (data) => {
            this.conversations = data.conversations || [];
            this.updateStats();
        });
        
        this.socket.on('models', (models) => {
            this.availableModels = models;
            this.renderModelSelection();
        });
        
        this.socket.on('responses', (data) => {
            this.handleResponses(data);
        });
        
        this.socket.on('saved-prompts', (prompts) => {
            this.savedPrompts = prompts;
            this.updateSavedPromptsDropdown();
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification(error.message || 'An error occurred', 'error');
        });
    }
    
    // Bin Management Methods
    async loadBins() {
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/bins`);
                const data = await response.json();
                this.bins = data.bins || [];
                this.renderBinList();
            } catch (error) {
                console.error('Failed to load bins:', error);
            }
        } else {
            // In Socket.io mode, use local storage for bins
            const saved = localStorage.getItem('tuneforge_bins');
            this.bins = saved ? JSON.parse(saved) : [];
            this.renderBinList();
        }
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
                <div class="bin-name">${this.escapeHtml(bin.name)}</div>
                <div class="bin-meta">${bin.conversationCount || 0} conversations</div>
            `;
            binEl.addEventListener('click', () => this.selectBin(bin));
            binList.appendChild(binEl);
        });
    }
    
    async selectBin(bin) {
        this.currentBin = bin;
        
        // Update UI
        document.getElementById('currentBinName').textContent = bin.name;
        document.getElementById('systemPrompt').value = bin.systemPrompt;
        
        // Show bin-specific UI
        document.querySelector('.app-container').classList.remove('no-bin-selected');
        document.querySelector('.app-container').classList.add('bin-selected');
        document.getElementById('binActions').style.display = 'block';
        document.getElementById('noBinMessage').style.display = 'none';
        document.getElementById('conversationDisplay').style.display = 'flex';
        document.getElementById('controlsPanel').style.display = 'flex';
        document.getElementById('inputArea').style.display = 'grid';
        
        // Load bin conversations
        await this.loadBinConversations();
        
        // Update bin list UI
        this.renderBinList();
        
        // Start new conversation
        this.newConversation();
    }
    
    async loadBinConversations() {
        if (!this.currentBin) return;
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/conversations?binId=${this.currentBin.id}`);
                const data = await response.json();
                this.conversations = data.conversations || [];
                this.updateStats();
            } catch (error) {
                console.error('Failed to load conversations:', error);
            }
        } else {
            // In Socket.io mode, filter conversations by bin
            const allConvs = JSON.parse(localStorage.getItem('tuneforge_conversations') || '[]');
            this.conversations = allConvs.filter(c => c.binId === this.currentBin.id);
            this.updateStats();
        }
    }
    
    showCreateBinModal() {
        document.getElementById('createBinModal').classList.add('active');
        document.getElementById('binName').focus();
    }
    
    async createBin() {
        const name = document.getElementById('binName').value.trim();
        const systemPrompt = document.getElementById('binSystemPrompt').value.trim();
        const description = document.getElementById('binDescription').value.trim();
        
        if (!name || !systemPrompt) {
            alert('Name and system prompt are required');
            return;
        }
        
        const bin = {
            id: Date.now().toString(),
            name,
            systemPrompt,
            description,
            createdAt: new Date().toISOString(),
            conversationCount: 0
        };
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/bins`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bin)
                });
                
                if (response.ok) {
                    const newBin = await response.json();
                    this.bins.push(newBin);
                    this.renderBinList();
                    document.getElementById('createBinModal').classList.remove('active');
                    this.clearBinForm();
                    this.selectBin(newBin);
                }
            } catch (error) {
                console.error('Failed to create bin:', error);
                alert('Failed to create bin');
            }
        } else {
            // Local storage mode
            this.bins.push(bin);
            localStorage.setItem('tuneforge_bins', JSON.stringify(this.bins));
            this.renderBinList();
            document.getElementById('createBinModal').classList.remove('active');
            this.clearBinForm();
            this.selectBin(bin);
        }
    }
    
    clearBinForm() {
        document.getElementById('binName').value = '';
        document.getElementById('binSystemPrompt').value = '';
        document.getElementById('binDescription').value = '';
    }
    
    async deleteBin() {
        if (!this.currentBin) return;
        
        if (!confirm(`Delete bin "${this.currentBin.name}" and all its conversations?`)) {
            return;
        }
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/bins/${this.currentBin.id}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    this.bins = this.bins.filter(b => b.id !== this.currentBin.id);
                    this.currentBin = null;
                    this.renderBinList();
                    this.resetToNoBinState();
                }
            } catch (error) {
                console.error('Failed to delete bin:', error);
            }
        } else {
            // Local storage mode
            this.bins = this.bins.filter(b => b.id !== this.currentBin.id);
            localStorage.setItem('tuneforge_bins', JSON.stringify(this.bins));
            
            // Delete conversations
            const allConvs = JSON.parse(localStorage.getItem('tuneforge_conversations') || '[]');
            const filtered = allConvs.filter(c => c.binId !== this.currentBin.id);
            localStorage.setItem('tuneforge_conversations', JSON.stringify(filtered));
            
            this.currentBin = null;
            this.renderBinList();
            this.resetToNoBinState();
        }
    }
    
    resetToNoBinState() {
        document.getElementById('currentBinName').textContent = 'NO BIN SELECTED';
        document.querySelector('.app-container').classList.add('no-bin-selected');
        document.querySelector('.app-container').classList.remove('bin-selected');
        document.getElementById('binActions').style.display = 'none';
        document.getElementById('noBinMessage').style.display = 'flex';
        document.getElementById('conversationDisplay').style.display = 'none';
        document.getElementById('controlsPanel').style.display = 'none';
        document.getElementById('inputArea').style.display = 'none';
        this.conversations = [];
        this.updateStats();
    }
    
    async exportBin() {
        if (!this.currentBin) return;
        
        if (this.isCloudflare) {
            window.location.href = `${this.apiBase}/export?binId=${this.currentBin.id}`;
        } else {
            // Local export
            const data = {
                bin: this.currentBin,
                conversations: this.conversations
            };
            
            const jsonl = this.conversations.map(conv => {
                return JSON.stringify({ messages: conv.messages });
            }).join('\n');
            
            const blob = new Blob([jsonl], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.currentBin.name.toLowerCase().replace(/\s+/g, '-')}-dataset.jsonl`;
            a.click();
            URL.revokeObjectURL(url);
        }
    }
    
    // Model Management
    async loadModels() {
        if (this.isCloudflare) {
            // Static list for Cloudflare mode
            this.availableModels = [
                { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
                { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
                { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
                { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'anthropic' }
            ];
        } else {
            // Request from server
            this.socket.emit('get-models');
        }
        this.renderModelSelection();
    }
    
    renderModelSelection() {
        const container = document.getElementById('modelSelection');
        container.innerHTML = '';
        
        this.availableModels.forEach(model => {
            const modelEl = document.createElement('div');
            modelEl.className = 'model-option';
            modelEl.innerHTML = `
                <div class="model-info">
                    <div class="model-name">${model.name}</div>
                    <div class="model-provider">${model.provider}</div>
                </div>
                <div class="model-status"></div>
            `;
            
            modelEl.addEventListener('click', () => this.toggleModel(model.id));
            modelEl.dataset.modelId = model.id;
            container.appendChild(modelEl);
        });
        
        this.updateModelCount();
    }
    
    toggleModel(modelId) {
        const index = this.selectedModels.indexOf(modelId);
        if (index > -1) {
            this.selectedModels.splice(index, 1);
        } else {
            this.selectedModels.push(modelId);
        }
        
        // Update UI
        const modelEl = document.querySelector(`[data-model-id="${modelId}"]`);
        if (modelEl) {
            modelEl.classList.toggle('selected');
        }
        
        this.updateModelCount();
    }
    
    selectAllModels() {
        this.selectedModels = this.availableModels.map(m => m.id);
        document.querySelectorAll('.model-option').forEach(el => {
            el.classList.add('selected');
        });
        this.updateModelCount();
    }
    
    updateModelCount() {
        document.getElementById('modelCount').textContent = this.selectedModels.length;
    }
    
    // Conversation Management
    newConversation() {
        this.currentMessages = [];
        document.getElementById('conversationFlow').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚡</div>
                <h3>Ready</h3>
                <p>Start your conversation</p>
            </div>
        `;
        document.getElementById('saveConversation').disabled = true;
        document.getElementById('turnCount').textContent = '0';
        document.getElementById('userMessage').value = '';
        document.getElementById('userMessage').focus();
    }
    
    async sendMessage() {
        if (!this.currentBin) {
            alert('Please select a bin first');
            return;
        }
        
        const message = document.getElementById('userMessage').value.trim();
        if (!message) return;
        
        if (this.selectedModels.length === 0) {
            alert('Please select at least one model');
            return;
        }
        
        // Add user message
        this.currentMessages.push({ role: 'user', content: message });
        this.addMessageToUI({ role: 'user', content: message });
        
        // Clear input
        document.getElementById('userMessage').value = '';
        
        // Get parameters
        const temperature = parseFloat(document.getElementById('temperature').value);
        const maxTokens = parseInt(document.getElementById('maxTokensValue').textContent);
        
        // Show loading state
        this.showLoomLoading();
        
        if (this.isCloudflare) {
            // Cloudflare API call
            try {
                const response = await fetch(`${this.apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        binId: this.currentBin.id,
                        systemPrompt: document.getElementById('systemPrompt').value,
                        messages: this.currentMessages,
                        models: this.selectedModels,
                        temperature,
                        maxTokens
                    })
                });
                
                const data = await response.json();
                this.handleResponses({ responses: data.responses });
            } catch (error) {
                console.error('Failed to generate responses:', error);
                this.showNotification('Failed to generate responses', 'error');
            }
        } else {
            // Socket.io emit
            this.socket.emit('generate', {
                systemPrompt: document.getElementById('systemPrompt').value,
                messages: this.currentMessages,
                models: this.selectedModels,
                temperature,
                maxTokens
            });
        }
        
        // Update turn count
        const turnCount = Math.floor(this.currentMessages.length / 2);
        document.getElementById('turnCount').textContent = turnCount;
    }
    
    addMessageToUI(message) {
        const flow = document.getElementById('conversationFlow');
        
        // Remove empty state if exists
        const emptyState = flow.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        const messageEl = document.createElement('div');
        messageEl.className = 'message-block';
        messageEl.innerHTML = `
            <div class="message ${message.role}">
                <div class="message-role">${message.role.toUpperCase()}</div>
                <div class="message-content">${this.escapeHtml(message.content)}</div>
            </div>
        `;
        
        flow.appendChild(messageEl);
        flow.scrollTop = flow.scrollHeight;
    }
    
    showLoomLoading() {
        const flow = document.getElementById('conversationFlow');
        const loadingEl = document.createElement('div');
        loadingEl.className = 'message-block loading-loom';
        loadingEl.innerHTML = `
            <div class="inline-loading-state simple-loading">
                <div class="loading-icon">⚡</div>
                <div class="loading-text">GENERATING RESPONSES...</div>
            </div>
        `;
        flow.appendChild(loadingEl);
        flow.scrollTop = flow.scrollHeight;
    }
    
    handleResponses(data) {
        const flow = document.getElementById('conversationFlow');
        const loadingEl = flow.querySelector('.loading-loom');
        if (loadingEl) loadingEl.remove();
        
        if (!data.responses || data.responses.length === 0) {
            this.showNotification('No responses generated', 'error');
            return;
        }
        
        // Create loom
        const loomEl = document.createElement('div');
        loomEl.className = 'message-block';
        loomEl.innerHTML = `
            <div class="completion-loom">
                <div class="completion-header">
                    <div class="completion-title">ASSISTANT RESPONSES</div>
                    <div class="completion-nav">
                        <span class="completion-counter">
                            <span id="loomIndex">1</span> / ${data.responses.length}
                        </span>
                        <span>← → navigate | Enter select</span>
                    </div>
                </div>
                <div class="completion-slider">
                    <div class="completion-track" id="loomTrack">
                        ${data.responses.map((resp, i) => this.createCompletionCard(resp, i)).join('')}
                    </div>
                    <div class="nav-indicators">
                        ${data.responses.map((_, i) => `
                            <div class="nav-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        
        flow.appendChild(loomEl);
        flow.scrollTop = flow.scrollHeight;
        
        // Setup loom navigation
        this.activeLoom = {
            element: loomEl,
            responses: data.responses,
            currentIndex: 0
        };
        
        // Enable save button
        document.getElementById('saveConversation').disabled = false;
    }
    
    createCompletionCard(response, index) {
        const isError = response.error || !response.content;
        return `
            <div class="completion-card ${index === 0 ? 'active' : ''} ${isError ? 'error' : ''}" data-index="${index}">
                <div class="completion-meta">
                    <div class="completion-model">${response.model || 'Unknown'}</div>
                    <div class="completion-stats">
                        ${response.usage ? `${response.usage.total_tokens} tokens` : ''}
                    </div>
                </div>
                <div class="completion-content">
                    ${isError ? 
                        `<div class="error-message">${response.error || 'No response generated'}</div>` :
                        this.escapeHtml(response.content)
                    }
                </div>
                ${!isError ? `
                <div class="response-actions">
                    <button class="edit-btn" onclick="tuneforge.editResponse(${index})" title="Edit response">✏️</button>
                </div>
                <div class="response-editor" id="editor-${index}">
                    <textarea class="edit-textarea" id="edit-textarea-${index}">${response.content}</textarea>
                    <div class="edit-actions">
                        <button class="btn-compact btn-primary save-edit" onclick="tuneforge.saveEdit(${index})">SAVE</button>
                        <button class="btn-compact cancel-edit" onclick="tuneforge.cancelEdit(${index})">CANCEL</button>
                    </div>
                </div>
                ` : ''}
                <div class="completion-actions">
                    <button class="action-btn" onclick="tuneforge.selectResponse(${index})" title="Select">✓</button>
                </div>
            </div>
        `;
    }
    
    navigateLoom(direction) {
        if (!this.activeLoom) return;
        
        const newIndex = Math.max(0, Math.min(
            this.activeLoom.responses.length - 1,
            this.activeLoom.currentIndex + direction
        ));
        
        if (newIndex !== this.activeLoom.currentIndex) {
            this.activeLoom.currentIndex = newIndex;
            
            // Update UI
            const track = document.getElementById('loomTrack');
            track.style.transform = `translateX(-${newIndex * 100}%)`;
            
            // Update indicators
            document.querySelectorAll('.nav-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === newIndex);
            });
            
            // Update counter
            document.getElementById('loomIndex').textContent = newIndex + 1;
            
            // Update active card
            document.querySelectorAll('.completion-card').forEach((card, i) => {
                card.classList.toggle('active', i === newIndex);
            });
        }
    }
    
    selectLoomResponse() {
        if (!this.activeLoom) return;
        this.selectResponse(this.activeLoom.currentIndex);
    }
    
    selectResponse(index) {
        if (!this.activeLoom) return;
        
        const response = this.activeLoom.responses[index];
        if (!response || response.error) return;
        
        // Add to messages
        this.currentMessages.push({
            role: 'assistant',
            content: response.content,
            model: response.model
        });
        
        // Replace loom with message
        const messageEl = document.createElement('div');
        messageEl.className = 'message-block';
        messageEl.innerHTML = `
            <div class="message assistant">
                <div class="message-role">ASSISTANT (${response.model})</div>
                <div class="message-content">${this.escapeHtml(response.content)}</div>
            </div>
        `;
        
        this.activeLoom.element.replaceWith(messageEl);
        this.activeLoom = null;
        
        // Focus input for next message
        document.getElementById('userMessage').focus();
    }
    
    editResponse(index) {
        document.getElementById(`editor-${index}`).classList.add('active');
    }
    
    saveEdit(index) {
        const newContent = document.getElementById(`edit-textarea-${index}`).value;
        if (this.activeLoom && this.activeLoom.responses[index]) {
            this.activeLoom.responses[index].content = newContent;
            this.activeLoom.responses[index].edited = true;
            
            // Update display
            const card = document.querySelector(`.completion-card[data-index="${index}"] .completion-content`);
            card.innerHTML = this.escapeHtml(newContent);
            
            // Hide editor
            document.getElementById(`editor-${index}`).classList.remove('active');
        }
    }
    
    cancelEdit(index) {
        document.getElementById(`editor-${index}`).classList.remove('active');
        // Reset textarea
        if (this.activeLoom && this.activeLoom.responses[index]) {
            document.getElementById(`edit-textarea-${index}`).value = this.activeLoom.responses[index].content;
        }
    }
    
    async saveConversation() {
        if (!this.currentBin || this.currentMessages.length < 2) {
            alert('Nothing to save');
            return;
        }
        
        const conversation = {
            id: Date.now().toString(),
            binId: this.currentBin.id,
            messages: [
                { role: 'system', content: document.getElementById('systemPrompt').value },
                ...this.currentMessages
            ],
            metadata: {
                createdAt: new Date().toISOString(),
                turnCount: Math.floor(this.currentMessages.length / 2),
                models: this.selectedModels,
                lastModel: this.currentMessages[this.currentMessages.length - 1].model
            }
        };
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/conversations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(conversation)
                });
                
                if (response.ok) {
                    this.conversations.push(conversation);
                    this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
                    this.updateStats();
                    this.showNotification('Conversation saved to dataset');
                    this.newConversation();
                }
            } catch (error) {
                console.error('Failed to save conversation:', error);
                alert('Failed to save conversation');
            }
        } else {
            // Local storage mode
            const allConvs = JSON.parse(localStorage.getItem('tuneforge_conversations') || '[]');
            allConvs.push(conversation);
            localStorage.setItem('tuneforge_conversations', JSON.stringify(allConvs));
            
            this.conversations.push(conversation);
            this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
            
            // Update bin
            const bins = JSON.parse(localStorage.getItem('tuneforge_bins') || '[]');
            const binIndex = bins.findIndex(b => b.id === this.currentBin.id);
            if (binIndex > -1) {
                bins[binIndex] = this.currentBin;
                localStorage.setItem('tuneforge_bins', JSON.stringify(bins));
            }
            
            this.updateStats();
            this.showNotification('Conversation saved to dataset');
            this.newConversation();
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
                <div class="conv-preview">${this.escapeHtml(preview.substring(0, 150))}...</div>
            `;
            
            list.appendChild(convEl);
        });
    }
    
    // Regeneration
    showRegenerateModal() {
        if (this.currentMessages.length < 2) {
            alert('No messages to regenerate');
            return;
        }
        
        document.getElementById('regenerateModal').classList.add('active');
    }
    
    async regenerateResponses() {
        const params = {
            temperature: parseFloat(document.getElementById('regenTemperature').value),
            maxTokens: parseInt(document.getElementById('regenMaxTokens').value),
            topP: parseFloat(document.getElementById('regenTopP').value),
            variations: parseInt(document.getElementById('regenVariations').value),
            frequencyPenalty: parseFloat(document.getElementById('regenFreqPenalty').value),
            presencePenalty: parseFloat(document.getElementById('regenPresPenalty').value),
            includeOriginal: document.getElementById('regenIncludeOriginal').checked,
            customPrompt: document.getElementById('customPromptVariation').value
        };
        
        // Show loading overlay
        document.getElementById('regeneratingOverlay').style.display = 'flex';
        document.getElementById('loadingTemp').textContent = params.temperature;
        document.getElementById('loadingVariations').textContent = params.variations;
        document.getElementById('regenerateModal').classList.remove('active');
        
        // Remove last assistant message
        const lastUserIndex = this.currentMessages.findLastIndex(m => m.role === 'user');
        const messagesToSend = this.currentMessages.slice(0, lastUserIndex + 1);
        
        if (params.customPrompt) {
            messagesToSend.push({ role: 'user', content: params.customPrompt });
        }
        
        // Generate new responses
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        binId: this.currentBin.id,
                        systemPrompt: document.getElementById('systemPrompt').value,
                        messages: messagesToSend,
                        models: this.selectedModels,
                        ...params
                    })
                });
                
                const data = await response.json();
                
                // Remove last assistant message from UI
                const flow = document.getElementById('conversationFlow');
                const lastBlock = flow.lastElementChild;
                if (lastBlock && lastBlock.querySelector('.message.assistant')) {
                    lastBlock.remove();
                }
                
                // Remove from messages array
                this.currentMessages = this.currentMessages.slice(0, lastUserIndex + 1);
                
                // Handle new responses
                this.handleResponses({ responses: data.responses });
                
            } catch (error) {
                console.error('Failed to regenerate:', error);
                this.showNotification('Failed to regenerate responses', 'error');
            }
        } else {
            // Socket.io mode
            this.socket.emit('regenerate', {
                systemPrompt: document.getElementById('systemPrompt').value,
                messages: messagesToSend,
                models: this.selectedModels,
                ...params
            });
        }
        
        // Hide loading overlay
        setTimeout(() => {
            document.getElementById('regeneratingOverlay').style.display = 'none';
        }, 1000);
    }
    
    // Export & Stats
    async exportDataset(format) {
        const conversations = this.conversations;
        
        if (conversations.length === 0) {
            alert('No conversations to export');
            return;
        }
        
        let content, mimeType, extension;
        
        if (format === 'jsonl') {
            content = conversations.map(conv => 
                JSON.stringify({ messages: conv.messages })
            ).join('\n');
            mimeType = 'application/jsonl';
            extension = 'jsonl';
        } else if (format === 'csv') {
            // CSV format
            const rows = ['role,content'];
            conversations.forEach(conv => {
                conv.messages.forEach(msg => {
                    const content = msg.content.replace(/"/g, '""');
                    rows.push(`"${msg.role}","${content}"`);
                });
            });
            content = rows.join('\n');
            mimeType = 'text/csv';
            extension = 'csv';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const binName = this.currentBin ? this.currentBin.name.toLowerCase().replace(/\s+/g, '-') : 'tuneforge';
        a.download = `${binName}-dataset-${Date.now()}.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    showStatsModal() {
        document.getElementById('statsModal').classList.add('active');
        
        // Calculate stats
        let totalMessages = 0;
        let totalTokens = 0;
        let userTokens = 0;
        let assistantTokens = 0;
        const modelUsage = {};
        
        this.conversations.forEach(conv => {
            totalMessages += conv.messages.length;
            
            conv.messages.forEach(msg => {
                // Estimate tokens (rough calculation)
                const tokens = Math.ceil(msg.content.length / 4);
                totalTokens += tokens;
                
                if (msg.role === 'user') {
                    userTokens += tokens;
                } else if (msg.role === 'assistant') {
                    assistantTokens += tokens;
                    if (msg.model) {
                        modelUsage[msg.model] = (modelUsage[msg.model] || 0) + 1;
                    }
                }
            });
        });
        
        // Update stats display
        document.getElementById('statTotalConv').textContent = this.conversations.length;
        document.getElementById('statTotalMsg').textContent = totalMessages;
        document.getElementById('statAvgMsg').textContent = 
            this.conversations.length > 0 ? Math.round(totalMessages / this.conversations.length) : 0;
        document.getElementById('statTotalTokens').textContent = totalTokens.toLocaleString();
        document.getElementById('statUserTokens').textContent = userTokens.toLocaleString();
        document.getElementById('statAssistantTokens').textContent = assistantTokens.toLocaleString();
        
        // Model stats
        const modelStatsEl = document.getElementById('modelStats');
        modelStatsEl.innerHTML = '';
        Object.entries(modelUsage).forEach(([model, count]) => {
            modelStatsEl.innerHTML += `
                <div class="stat-item">
                    <span>${model}</span>
                    <span class="stat-value">${count}</span>
                </div>
            `;
        });
    }
    
    updateStats() {
        document.getElementById('datasetCount').textContent = this.conversations.length;
        document.getElementById('convCount').textContent = this.conversations.length;
        
        // Calculate total tokens
        let totalTokens = 0;
        this.conversations.forEach(conv => {
            conv.messages.forEach(msg => {
                totalTokens += Math.ceil(msg.content.length / 4); // Rough estimate
            });
        });
        document.getElementById('tokenCount').textContent = totalTokens.toLocaleString();
        
        // Quality score (simple heuristic)
        const avgTurns = this.conversations.length > 0 ? 
            this.conversations.reduce((sum, conv) => sum + conv.metadata.turnCount, 0) / this.conversations.length : 0;
        const qualityScore = Math.min(100, Math.round(avgTurns * 20));
        document.getElementById('qualityScore').textContent = qualityScore + '%';
    }
    
    // Prompt Management
    async loadSavedPrompts() {
        if (this.isCloudflare) {
            // Use local storage for prompts
            const saved = localStorage.getItem('tuneforge_prompts');
            this.savedPrompts = saved ? JSON.parse(saved) : [];
        } else {
            this.socket.emit('get-saved-prompts');
        }
        this.updateSavedPromptsDropdown();
    }
    
    updateSavedPromptsDropdown() {
        const select = document.getElementById('savedPrompts');
        select.innerHTML = '<option value="">Load Saved...</option>';
        
        this.savedPrompts.forEach(prompt => {
            const option = document.createElement('option');
            option.value = prompt.id;
            option.textContent = prompt.name;
            select.appendChild(option);
        });
    }
    
    async saveSystemPrompt() {
        const promptText = document.getElementById('systemPrompt').value.trim();
        if (!promptText) return;
        
        const name = prompt('Enter a name for this prompt:');
        if (!name) return;
        
        const promptObj = {
            id: Date.now().toString(),
            name,
            content: promptText,
            createdAt: new Date().toISOString()
        };
        
        this.savedPrompts.push(promptObj);
        
        if (this.isCloudflare) {
            localStorage.setItem('tuneforge_prompts', JSON.stringify(this.savedPrompts));
        } else {
            this.socket.emit('save-prompt', promptObj);
        }
        
        this.updateSavedPromptsDropdown();
        this.showNotification('Prompt saved successfully');
    }
    
    loadPrompt(promptId) {
        if (!promptId) return;
        
        const prompt = this.savedPrompts.find(p => p.id === promptId);
        if (prompt) {
            document.getElementById('systemPrompt').value = prompt.content;
        }
    }
    
    // Helper Methods
    adjustTokens(delta) {
        const current = parseInt(document.getElementById('maxTokensValue').textContent);
        const newValue = Math.max(100, Math.min(4000, current + delta));
        document.getElementById('maxTokensValue').textContent = newValue;
    }
    
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-icon">${type === 'success' ? '✓' : '✗'}</div>
            <div class="notification-message">${message}</div>
        `;
        
        // Add to container or create one
        let container = document.querySelector('.notifications');
        if (!container) {
            container = document.createElement('div');
            container.className = 'notifications';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    loadDataset() {
        if (!this.isCloudflare && this.socket) {
            this.socket.emit('get-dataset');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.tuneforge = new TuneForgeUltimate();
});