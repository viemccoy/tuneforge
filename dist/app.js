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
        this.currentConversationId = null;
        this.currentConversationName = '';
        this.currentConversationDescription = '';
        this.selectedModels = [];
        this.availableModels = [];
        this.savedPrompts = [];
        this.activeLoom = null;
        this.stats = {
            conversations: 0,
            totalTokens: 0,
            modelUsage: {}
        };
        
        // Request management
        this.isGenerating = false;
        this.activeRequestId = null;
        
        // Presence tracking
        this.connectedUsers = new Map();
        this.userId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        
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
        
        // Initialize Loom
        this.loom = new ConversationLoom(this);
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
        document.getElementById('newConversation').addEventListener('click', () => this.showNewConversationModal());
        document.getElementById('saveConversation').addEventListener('click', () => this.saveConversation());
        document.getElementById('deleteConversation').addEventListener('click', () => this.deleteConversation());
        document.getElementById('viewConversations').addEventListener('click', () => this.showConversationsModal());
        
        // New Conversation Modal
        document.getElementById('confirmNewConversation').addEventListener('click', () => this.createNewConversation());
        document.getElementById('cancelNewConversation').addEventListener('click', () => {
            document.getElementById('newConversationModal').classList.remove('active');
            document.getElementById('newConversationName').value = '';
            document.getElementById('newConversationDescription').value = '';
            document.getElementById('nameError').style.display = 'none';
        });
        document.getElementById('newConversationName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createNewConversation();
        });
        
        // Conversation Name Editing
        document.getElementById('editConversationName').addEventListener('click', () => this.startEditingConversationName());
        document.getElementById('conversationNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.saveConversationName();
            } else if (e.key === 'Escape') {
                this.cancelEditingConversationName();
            }
        });
        document.getElementById('conversationNameInput').addEventListener('blur', () => this.saveConversationName());
        
        // Model Selection
        document.getElementById('selectAllModels').addEventListener('click', () => this.selectAllModels());
        
        // Parameters
        document.getElementById('temperature').addEventListener('input', (e) => {
            document.getElementById('temperatureValue').textContent = e.target.value;
        });
        
        // Token Controls
        document.querySelector('.token-decrease').addEventListener('click', () => this.adjustTokens(-100));
        document.querySelector('.token-increase').addEventListener('click', () => this.adjustTokens(100));
        
        // Regenerate All
        document.getElementById('regenerateLast').addEventListener('click', () => this.regenerateAll());
        
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
                if (!this.isGenerating) {
                    this.sendMessage();
                }
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
                        e.stopPropagation();
                        this.navigateLoom(-1);
                        break;
                    case 'ArrowRight':
                        e.preventDefault();
                        e.stopPropagation();
                        this.navigateLoom(1);
                        break;
                    case 'Enter':
                        e.preventDefault();
                        e.stopPropagation();
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
            // Reset generation state for Socket.io
            this.isGenerating = false;
            this.activeRequestId = null;
            this.enableGenerationUI();
        });
        
        this.socket.on('saved-prompts', (prompts) => {
            this.savedPrompts = prompts;
            this.updateSavedPromptsDropdown();
        });
        
        this.socket.on('error', (error) => {
            console.error('Socket error:', error);
            this.showNotification(error.message || 'An error occurred', 'error');
        });
        
        // Presence tracking
        this.socket.on('user-joined', (data) => {
            this.handleUserJoined(data);
        });
        
        this.socket.on('user-left', (data) => {
            this.handleUserLeft(data);
        });
        
        this.socket.on('active-users', (users) => {
            this.updateActiveUsers(users);
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
            binEl.className = 'bin-folder' + (this.currentBin?.id === bin.id ? ' active' : '');
            binEl.dataset.binId = bin.id; // Add data attribute for easier lookup
            
            // Bin header (clickable to expand/collapse)
            const binHeader = document.createElement('div');
            binHeader.className = 'bin-header';
            binHeader.innerHTML = `
                <span class="folder-icon">&gt;</span>
                <span class="bin-name">${this.escapeHtml(bin.name)}</span>
                <span class="bin-count">${bin.conversationCount || 0}</span>
            `;
            binHeader.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                // Select the bin if it's not already selected
                if (this.currentBin?.id !== bin.id) {
                    await this.selectBin(bin);
                } else {
                    // If already selected, just toggle expansion
                    this.toggleBinExpanded(bin.id);
                }
            });
            
            // Conversation list (nested)
            const convList = document.createElement('div');
            convList.className = 'conversation-list nested';
            convList.id = `convList-${bin.id}`;
            convList.style.display = 'none';
            
            binEl.appendChild(binHeader);
            binEl.appendChild(convList);
            binList.appendChild(binEl);
        });
    }
    
    async toggleBinExpanded(binId) {
        const convList = document.getElementById(`convList-${binId}`);
        const binEl = convList.parentElement;
        const folderIcon = binEl.querySelector('.folder-icon');
        
        if (convList.style.display === 'none') {
            // Expand - load conversations if needed
            convList.style.display = 'block';
            folderIcon.textContent = 'v';
            binEl.classList.add('expanded');
            
            // Load conversations for this bin
            await this.loadConversationsForBin(binId);
        } else {
            // Collapse
            convList.style.display = 'none';
            folderIcon.textContent = '>';
            binEl.classList.remove('expanded');
        }
    }
    
    async loadConversationsForBin(binId) {
        const convList = document.getElementById(`convList-${binId}`);
        convList.innerHTML = '<div class="loading-state">Loading conversations...</div>';
        
        let conversations = [];
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/conversations?binId=${binId}`);
                const data = await response.json();
                conversations = data.conversations || [];
            } catch (error) {
                console.error('Failed to load conversations:', error);
                convList.innerHTML = '<div class="error-state">Failed to load</div>';
                return;
            }
        } else {
            // In Socket.io mode, filter conversations by bin
            const allConvs = JSON.parse(localStorage.getItem('tuneforge_conversations') || '[]');
            conversations = allConvs.filter(c => c.binId === binId);
        }
        
        convList.innerHTML = '';
        
        if (conversations.length === 0) {
            convList.innerHTML = '<div class="empty-nested">No conversations yet</div>';
            return;
        }
        
        conversations.forEach(conv => {
            const convEl = document.createElement('div');
            convEl.className = 'conversation-file';
            convEl.dataset.conversationId = conv.id; // Add data attribute for easier lookup
            
            const displayName = conv.name || this.getConversationPreview(conv);
            const date = new Date(conv.metadata.createdAt);
            
            convEl.innerHTML = `
                <span class="file-icon">[-]</span>
                <div class="file-info">
                    <div class="file-name" data-conv-name="${conv.id}">${this.escapeHtml(displayName)}</div>
                    <div class="file-meta">
                        <span>${date.toLocaleDateString()}</span>
                        <span class="turn-count">${conv.metadata.turnCount} turns</span>
                    </div>
                </div>
            `;
            
            convEl.addEventListener('click', async () => {
                // If this bin isn't currently selected, select it first
                if (this.currentBin?.id !== binId) {
                    const bin = this.bins.find(b => b.id === binId);
                    if (bin) {
                        await this.selectBin(bin, true); // Skip new conversation creation
                    }
                }
                // Then load the conversation
                this.loadConversation(conv);
            });
            convList.appendChild(convEl);
        });
    }
    
    async selectBin(bin, skipNewConversation = false) {
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
        
        // Auto-expand selected bin
        setTimeout(() => {
            const convList = document.getElementById(`convList-${bin.id}`);
            if (convList && convList.style.display === 'none') {
                this.toggleBinExpanded(bin.id);
            }
        }, 100);
        
        // Start new conversation only if not loading a specific conversation
        if (!skipNewConversation) {
            this.clearConversation();
        }
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
        if (!this.currentBin) {
            console.log('No bin selected to delete');
            return;
        }
        
        if (!confirm(`Delete bin "${this.currentBin.name}" and all its conversations?`)) {
            return;
        }
        
        console.log('Deleting bin:', this.currentBin.id);
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/bins/${this.currentBin.id}`, {
                    method: 'DELETE'
                });
                
                console.log('Delete response status:', response.status);
                
                if (response.ok) {
                    this.bins = this.bins.filter(b => b.id !== this.currentBin.id);
                    this.currentBin = null;
                    this.renderBinList();
                    this.resetToNoBinState();
                    this.showNotification('Bin deleted successfully');
                } else {
                    const error = await response.text();
                    console.error('Delete failed:', error);
                    this.showNotification(`Failed to delete bin: ${response.status}`, 'error');
                }
            } catch (error) {
                console.error('Failed to delete bin:', error);
                this.showNotification('Failed to delete bin', 'error');
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
            this.showNotification('Bin deleted successfully');
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
            // Static list for Cloudflare mode - matching local server models
            this.availableModels = [
                { id: 'gpt-4.1-2025-04-14', name: 'GPT-4.1', provider: 'openai' },
                { id: 'o3-2025-04-16', name: 'GPT-o3', provider: 'openai' },
                { id: 'o4-mini-2025-04-16', name: 'GPT-o4-mini', provider: 'openai' },
                { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
                { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
                { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.5 Flash', provider: 'google' },
                { id: 'deepseek/deepseek-r1', name: 'Deepseek R1', provider: 'openrouter' }
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
    loadConversation(conversation) {
        // Set current conversation details
        this.currentConversationId = conversation.id;
        this.currentConversationName = conversation.name || this.getConversationPreview(conversation);
        this.currentConversationDescription = conversation.description || '';
        
        // Load conversation into the UI
        this.currentMessages = conversation.messages.filter(m => m.role !== 'system');
        
        // Clear and rebuild conversation flow
        const flow = document.getElementById('conversationFlow');
        flow.innerHTML = '';
        
        // Add all messages to UI
        this.currentMessages.forEach(msg => {
            this.addMessageToUI(msg);
        });
        
        // Update stats
        document.getElementById('turnCount').textContent = Math.floor(this.currentMessages.length / 2);
        document.getElementById('saveConversation').disabled = false;
        document.getElementById('deleteConversation').disabled = false;
        
        // Update conversation name display
        this.updateConversationNameDisplay();
        
        // Scroll to bottom
        flow.scrollTop = flow.scrollHeight;
        
        // Focus input for continuation
        document.getElementById('userMessage').focus();
        
        this.showNotification('Conversation loaded');
    }
    
    getConversationPreview(conversation) {
        const firstUserMsg = conversation.messages.find(m => m.role === 'user');
        return firstUserMsg ? firstUserMsg.content.substring(0, 30) + '...' : 'Untitled Conversation';
    }
    
    updateConversationNameDisplay() {
        const nameEl = document.getElementById('conversationName');
        nameEl.textContent = this.currentConversationName || 'New Conversation';
    }
    
    updateConversationNameInLists(conversationId, newName) {
        // Update all conversation file elements with this ID
        const convElements = document.querySelectorAll(`[data-conversation-id="${conversationId}"]`);
        convElements.forEach(convEl => {
            const nameEl = convEl.querySelector('.file-name');
            if (nameEl) {
                nameEl.textContent = newName;
            }
        });
        
        // Also update turn count if the conversation was just saved
        const conv = this.conversations.find(c => c.id === conversationId);
        if (conv) {
            convElements.forEach(convEl => {
                const turnCountEl = convEl.querySelector('.turn-count');
                if (turnCountEl && conv.metadata) {
                    turnCountEl.textContent = `${conv.metadata.turnCount} turns`;
                }
            });
        }
    }
    
    startEditingConversationName() {
        const nameEl = document.getElementById('conversationName');
        const inputEl = document.getElementById('conversationNameInput');
        const editBtn = document.getElementById('editConversationName');
        
        inputEl.value = this.currentConversationName || nameEl.textContent;
        nameEl.style.display = 'none';
        editBtn.style.display = 'none';
        inputEl.style.display = 'inline-block';
        inputEl.focus();
        inputEl.select();
    }
    
    async saveConversationName() {
        const inputEl = document.getElementById('conversationNameInput');
        const nameEl = document.getElementById('conversationName');
        const editBtn = document.getElementById('editConversationName');
        
        const newName = inputEl.value.trim();
        if (newName && newName !== this.currentConversationName) {
            const oldName = this.currentConversationName;
            this.currentConversationName = newName;
            nameEl.textContent = newName;
            
            // If conversation exists, save it with the new name
            if (this.currentConversationId) {
                try {
                    await this.saveConversation(true);
                    
                    // Force refresh the conversation list to show the new name
                    if (this.currentBin) {
                        // Update the local conversations array immediately
                        const convIndex = this.conversations.findIndex(c => c.id === this.currentConversationId);
                        if (convIndex > -1) {
                            this.conversations[convIndex].name = newName;
                        }
                        
                        // Update the conversation name in all visible lists
                        this.updateConversationNameInLists(this.currentConversationId, newName);
                    }
                    
                    this.showNotification('Conversation renamed successfully');
                } catch (error) {
                    // Revert on error
                    this.currentConversationName = oldName;
                    nameEl.textContent = oldName;
                    this.showNotification('Failed to rename conversation', 'error');
                }
            }
        }
        
        inputEl.style.display = 'none';
        nameEl.style.display = 'inline';
        editBtn.style.display = 'inline-block';
    }
    
    cancelEditingConversationName() {
        const inputEl = document.getElementById('conversationNameInput');
        const nameEl = document.getElementById('conversationName');
        const editBtn = document.getElementById('editConversationName');
        
        inputEl.style.display = 'none';
        nameEl.style.display = 'inline';
        editBtn.style.display = 'inline-block';
    }
    
    showNewConversationModal() {
        if (!this.currentBin) {
            alert('Please select a bin first');
            return;
        }
        
        document.getElementById('newConversationModal').classList.add('active');
        document.getElementById('newConversationName').value = '';
        document.getElementById('newConversationDescription').value = '';
        document.getElementById('nameError').style.display = 'none';
        setTimeout(() => document.getElementById('newConversationName').focus(), 100);
    }
    
    async createNewConversation() {
        const nameInput = document.getElementById('newConversationName').value.trim();
        const description = document.getElementById('newConversationDescription').value.trim();
        const errorEl = document.getElementById('nameError');
        
        if (!nameInput) {
            errorEl.textContent = 'Conversation name is required';
            errorEl.style.display = 'block';
            return;
        }
        
        // Check if name already exists in current bin
        const nameExists = this.conversations.some(conv => 
            conv.name && conv.name.toLowerCase() === nameInput.toLowerCase()
        );
        
        if (nameExists) {
            errorEl.textContent = 'A conversation with this name already exists in this bin';
            errorEl.style.display = 'block';
            return;
        }
        
        // Create the new conversation
        this.currentMessages = [];
        this.currentConversationId = null;
        this.currentConversationName = nameInput;
        this.currentConversationDescription = description;
        
        document.getElementById('conversationFlow').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚡</div>
                <h3>Ready</h3>
                <p>Start your conversation</p>
            </div>
        `;
        document.getElementById('saveConversation').disabled = true;
        document.getElementById('deleteConversation').disabled = true;
        document.getElementById('turnCount').textContent = '0';
        document.getElementById('userMessage').value = '';
        
        this.updateConversationNameDisplay();
        
        // Close modal
        document.getElementById('newConversationModal').classList.remove('active');
        document.getElementById('newConversationName').value = '';
        document.getElementById('newConversationDescription').value = '';
        
        // Focus message input
        document.getElementById('userMessage').focus();
        
        this.showNotification('New conversation created: ' + nameInput);
    }
    
    newConversation() {
        // This method is now just a wrapper that shows the modal
        this.showNewConversationModal();
    }
    
    clearConversation() {
        // Clear conversation without showing modal (used internally)
        this.currentMessages = [];
        this.currentConversationId = null;
        this.currentConversationName = '';
        this.currentConversationDescription = '';
        
        document.getElementById('conversationFlow').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚡</div>
                <h3>Ready</h3>
                <p>Start your conversation</p>
            </div>
        `;
        document.getElementById('saveConversation').disabled = true;
        document.getElementById('deleteConversation').disabled = true;
        document.getElementById('turnCount').textContent = '0';
        document.getElementById('userMessage').value = '';
        
        this.updateConversationNameDisplay();
    }
    
    async sendMessage() {
        // Prevent duplicate calls
        if (this.isGenerating) {
            this.showNotification('Please wait for the current request to complete', 'warning');
            return;
        }
        
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
        
        // Set generating flag and disable UI
        this.isGenerating = true;
        this.activeRequestId = Date.now().toString();
        this.disableGenerationUI();
        
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
        
        // Prepare model-specific parameters
        const generateParams = {
            binId: this.currentBin.id,
            systemPrompt: document.getElementById('systemPrompt').value,
            messages: this.currentMessages,
            models: this.selectedModels
        };
        
        // Check if any selected model is o3/o4-mini which requires special parameters
        const hasO3Models = this.selectedModels.some(modelId => 
            modelId.includes('o3') || modelId.includes('o4-mini')
        );
        
        if (hasO3Models) {
            // For o3/o4-mini models, use max_completion_tokens instead of maxTokens
            generateParams.max_completion_tokens = maxTokens;
            // Don't include temperature for o3 models as it's not supported
        } else {
            // For standard models, use regular parameters
            generateParams.temperature = temperature;
            generateParams.maxTokens = maxTokens;
        }
        
        if (this.isCloudflare) {
            // Cloudflare API call
            const currentRequestId = this.activeRequestId;
            try {
                const response = await fetch(`${this.apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(generateParams)
                });
                
                // Check if this is still the active request
                if (this.activeRequestId !== currentRequestId) {
                    console.warn('Request cancelled - newer request in progress');
                    return;
                }
                
                const data = await response.json();
                this.handleResponses({ responses: data.responses });
            } catch (error) {
                console.error('Failed to generate responses:', error);
                this.showNotification('Failed to generate responses', 'error');
                // Remove loading state
                const flow = document.getElementById('conversationFlow');
                const loadingEl = flow.querySelector('.loading-loom');
                if (loadingEl) loadingEl.remove();
            } finally {
                // Only reset if this is still the active request
                if (this.activeRequestId === currentRequestId) {
                    this.isGenerating = false;
                    this.activeRequestId = null;
                    this.enableGenerationUI();
                }
            }
        } else {
            // Socket.io emit
            this.socket.emit('generate', generateParams);
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
        
        // Update loom icons if loom is initialized
        if (this.loom) {
            this.loom.addLoomIcons();
        }
    }
    
    showLoomLoading() {
        const flow = document.getElementById('conversationFlow');
        const loadingEl = document.createElement('div');
        loadingEl.className = 'message-block loading-loom';
        loadingEl.innerHTML = `
            <div class="inline-loading-state simple-loading">
                <div class="loading-text">GENERATING RESPONSES<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span></div>
            </div>
        `;
        flow.appendChild(loadingEl);
        flow.scrollTop = flow.scrollHeight;
    }
    
    handleResponses(data) {
        // Reset generation state
        this.isGenerating = false;
        this.activeRequestId = null;
        this.enableGenerationUI();
        
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
            <div class="completion-loom" tabindex="0">
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
        
        // Focus the loom for keyboard navigation
        const loomElement = loomEl.querySelector('.completion-loom');
        if (loomElement) {
            setTimeout(() => loomElement.focus(), 100);
        }
        
        // Update loom icons if loom is initialized
        if (this.loom) {
            setTimeout(() => this.loom.addLoomIcons(), 100);
        }
        
        // Enable save button
        document.getElementById('saveConversation').disabled = false;
    }
    
    createCompletionCard(response, index) {
        const isError = response.error || !response.content;
        const escapedContent = !isError ? this.escapeHtml(response.content) : '';
        
        return `
            <div class="completion-card ${index === 0 ? 'active' : ''} ${isError ? 'error' : ''}" data-index="${index}">
                <div class="completion-meta">
                    <div class="completion-model">${response.model || 'Unknown'}${response.edited ? ' (edited)' : ''}</div>
                    <div class="completion-stats">
                        ${response.usage ? `${response.usage.total_tokens} tokens` : ''}
                    </div>
                </div>
                <div class="completion-content" id="content-${index}">
                    ${isError ? 
                        `<div class="error-message">${response.error || 'No response generated'}</div>` :
                        escapedContent
                    }
                </div>
                ${!isError ? `
                <div class="response-actions">
                    <button class="edit-btn action-btn" onclick="tuneforge.editResponse(${index})" title="Edit response">EDIT</button>
                    <button class="regen-btn action-btn" onclick="tuneforge.showRegenMenu(${index})" title="Regenerate response">REGEN</button>
                </div>
                <div class="response-editor" id="editor-${index}">
                    <div class="editor-header">
                        <span class="editor-title">EDIT RESPONSE</span>
                        <button class="close-btn" onclick="tuneforge.cancelEdit(${index})">[X]</button>
                    </div>
                    <textarea class="edit-textarea" id="edit-textarea-${index}">${escapedContent}</textarea>
                    <div class="edit-actions">
                        <button class="btn-compact btn-primary save-edit" onclick="tuneforge.saveEdit(${index})">SAVE</button>
                        <button class="btn-compact cancel-edit" onclick="tuneforge.cancelEdit(${index})">CANCEL</button>
                    </div>
                </div>
                <div class="regen-menu" id="regen-menu-${index}">
                    <div class="regen-header">
                        <span class="regen-title">[REGENERATE SETTINGS]</span>
                        <button class="close-btn" onclick="tuneforge.closeRegenMenu(${index})">[X]</button>
                    </div>
                    <div class="regen-controls">
                        <div class="regen-section">
                            <h4>CORE PARAMETERS</h4>
                            <div class="control-group">
                                <label>Temperature <span class="value-display" id="regen-temp-val-${index}">${response.temperature || 0.7}</span></label>
                                <input type="range" id="regen-temp-${index}" min="0" max="2" step="0.1" value="${response.temperature || 0.7}" oninput="document.getElementById('regen-temp-val-${index}').textContent = this.value">
                                <span class="param-help">Randomness (0=deterministic, 2=creative)</span>
                            </div>
                            <div class="control-group">
                                <label>Max Tokens</label>
                                <input type="number" id="regen-tokens-${index}" min="100" max="8000" value="${response.maxTokens || 1000}" class="token-input">
                                <span class="param-help">Maximum response length</span>
                            </div>
                        </div>
                        
                        <div class="regen-section">
                            <h4>ADVANCED OPTIONS</h4>
                            <div class="control-group">
                                <label>Top P <span class="value-display" id="regen-top-p-val-${index}">1.0</span></label>
                                <input type="range" id="regen-top-p-${index}" min="0" max="1" step="0.05" value="1" oninput="document.getElementById('regen-top-p-val-${index}').textContent = this.value">
                                <span class="param-help">Nucleus sampling threshold</span>
                            </div>
                            <div class="control-group">
                                <label>Frequency Penalty <span class="value-display" id="regen-freq-val-${index}">0.0</span></label>
                                <input type="range" id="regen-freq-${index}" min="-2" max="2" step="0.1" value="0" oninput="document.getElementById('regen-freq-val-${index}').textContent = this.value">
                                <span class="param-help">Reduce repetition</span>
                            </div>
                            <div class="control-group">
                                <label>Presence Penalty <span class="value-display" id="regen-pres-val-${index}">0.0</span></label>
                                <input type="range" id="regen-pres-${index}" min="-2" max="2" step="0.1" value="0" oninput="document.getElementById('regen-pres-val-${index}').textContent = this.value">
                                <span class="param-help">Encourage new topics</span>
                            </div>
                        </div>
                        
                        <div class="regen-section">
                            <h4>MODEL & INSTRUCTIONS</h4>
                            <div class="control-group">
                                <label>Model</label>
                                <select id="regen-model-${index}" class="model-select">
                                    <option value="same">Same Model (${response.model})</option>
                                    <option value="">── Select Different Model ──</option>
                                    ${this.availableModels.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="control-group">
                                <label>Custom Instructions</label>
                                <textarea id="regen-instructions-${index}" class="instructions-textarea" placeholder="e.g., Make the response more concise, add examples, focus on practical implementation..."></textarea>
                            </div>
                            <div class="control-group">
                                <label>Variations</label>
                                <select id="regen-variations-${index}" class="model-select">
                                    <option value="1">1 response</option>
                                    <option value="3">3 responses</option>
                                    <option value="5">5 responses</option>
                                </select>
                                <span class="param-help">Generate multiple alternatives</span>
                            </div>
                        </div>
                    </div>
                    <div class="regen-actions">
                        <button class="btn-compact btn-primary" onclick="tuneforge.regenerateSingle(${index})">&gt;&gt; REGENERATE</button>
                        <button class="btn-compact btn-secondary" onclick="tuneforge.resetRegenSettings(${index})">RESET</button>
                        <button class="btn-compact cancel-btn" onclick="tuneforge.closeRegenMenu(${index})">CANCEL</button>
                    </div>
                </div>
                ` : ''}
                <div class="completion-actions">
                    <button class="action-btn select-btn" onclick="tuneforge.selectResponse(${index})" title="Select">[OK]</button>
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
        
        // Update loom icons if loom is initialized
        if (this.loom) {
            setTimeout(() => this.loom.addLoomIcons(), 100);
        }
        
        // Auto-save the conversation after selecting a response
        this.saveConversation(true);
        
        // Focus input for next message
        document.getElementById('userMessage').focus();
    }
    
    editResponse(index) {
        // Close any other open editors or menus
        document.querySelectorAll('.response-editor.active').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.regen-menu.active').forEach(el => el.classList.remove('active'));
        
        // Open this editor
        const editor = document.getElementById(`editor-${index}`);
        if (editor) {
            editor.classList.add('active');
            // Focus the textarea
            const textarea = document.getElementById(`edit-textarea-${index}`);
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
        }
    }
    
    saveEdit(index) {
        const newContent = document.getElementById(`edit-textarea-${index}`).value;
        if (this.activeLoom && this.activeLoom.responses[index]) {
            this.activeLoom.responses[index].content = newContent;
            this.activeLoom.responses[index].edited = true;
            
            // Update display
            const contentEl = document.getElementById(`content-${index}`);
            if (contentEl) {
                contentEl.innerHTML = this.escapeHtml(newContent);
            }
            
            // Update model label to show (edited)
            const modelEl = document.querySelector(`.completion-card[data-index="${index}"] .completion-model`);
            if (modelEl && !modelEl.textContent.includes('(edited)')) {
                modelEl.textContent += ' (edited)';
            }
            
            // Hide editor
            document.getElementById(`editor-${index}`).classList.remove('active');
            
            this.showNotification('Response edited successfully');
        }
    }
    
    cancelEdit(index) {
        const editor = document.getElementById(`editor-${index}`);
        if (editor) {
            editor.classList.remove('active');
        }
        
        // Reset textarea to original content
        if (this.activeLoom && this.activeLoom.responses[index]) {
            const textarea = document.getElementById(`edit-textarea-${index}`);
            if (textarea) {
                textarea.value = this.activeLoom.responses[index].content;
            }
        }
    }
    
    showRegenMenu(index) {
        // Close any open editors or menus
        document.querySelectorAll('.response-editor.active').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.regen-menu.active').forEach(el => el.classList.remove('active'));
        
        // Open this regenerate menu
        const menu = document.getElementById(`regen-menu-${index}`);
        if (menu) {
            menu.classList.add('active');
            
            // Scroll the menu into view if needed
            setTimeout(() => {
                menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } else {
            console.error('Regenerate menu not found for index:', index);
        }
    }
    
    closeRegenMenu(index) {
        const menu = document.getElementById(`regen-menu-${index}`);
        if (menu) {
            menu.classList.remove('active');
        }
    }
    
    resetRegenSettings(index) {
        // Reset all settings to defaults
        document.getElementById(`regen-temp-${index}`).value = 0.7;
        document.getElementById(`regen-temp-val-${index}`).textContent = '0.7';
        document.getElementById(`regen-tokens-${index}`).value = 1000;
        document.getElementById(`regen-top-p-${index}`).value = 1.0;
        document.getElementById(`regen-top-p-val-${index}`).textContent = '1.0';
        document.getElementById(`regen-freq-${index}`).value = 0;
        document.getElementById(`regen-freq-val-${index}`).textContent = '0.0';
        document.getElementById(`regen-pres-${index}`).value = 0;
        document.getElementById(`regen-pres-val-${index}`).textContent = '0.0';
        document.getElementById(`regen-model-${index}`).value = 'same';
        document.getElementById(`regen-instructions-${index}`).value = '';
        document.getElementById(`regen-variations-${index}`).value = '1';
        
        this.showNotification('Settings reset to defaults');
    }
    
    async regenerateSingle(index) {
        if (!this.activeLoom || !this.activeLoom.responses[index]) return;
        
        // Prevent duplicate calls
        if (this.isGenerating) {
            this.showNotification('Please wait for the current request to complete', 'warning');
            return;
        }
        
        const response = this.activeLoom.responses[index];
        const temperature = parseFloat(document.getElementById(`regen-temp-${index}`).value);
        const maxTokens = parseInt(document.getElementById(`regen-tokens-${index}`).value);
        const modelSelect = document.getElementById(`regen-model-${index}`).value;
        const customInstructions = document.getElementById(`regen-instructions-${index}`).value;
        
        const model = modelSelect === 'same' ? response.model : modelSelect;
        
        // Close the menu
        this.closeRegenMenu(index);
        
        // Set generating flag
        this.isGenerating = true;
        this.activeRequestId = Date.now().toString();
        
        // Show loading state on this card
        const card = document.querySelector(`.completion-card[data-index="${index}"]`);
        if (!card) {
            console.error('Card not found for index:', index);
            this.isGenerating = false;
            this.activeRequestId = null;
            return;
        }
        card.classList.add('regenerating');
        
        // Get messages up to the point where this loom was generated
        // This is all messages except the ones in the current loom
        const loomStartIndex = this.currentMessages.length;
        const messagesToSend = [...this.currentMessages];
        
        // Add custom instructions if provided
        if (customInstructions) {
            messagesToSend.push({ role: 'system', content: customInstructions });
        }
        
        if (this.isCloudflare) {
            const currentRequestId = this.activeRequestId;
            try {
                // Prepare model-specific parameters
                const generateParams = {
                    binId: this.currentBin.id,
                    systemPrompt: document.getElementById('systemPrompt').value,
                    messages: messagesToSend,
                    models: [model]
                };
                
                // Check if regenerating with o3/o4-mini model
                const isO3Model = model.includes('o3') || model.includes('o4-mini');
                
                if (isO3Model) {
                    // For o3/o4-mini models, use max_completion_tokens
                    generateParams.max_completion_tokens = maxTokens;
                } else {
                    // For standard models, use regular parameters
                    generateParams.temperature = temperature;
                    generateParams.maxTokens = maxTokens;
                }
                
                const response = await fetch(`${this.apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(generateParams)
                });
                
                // Check if this is still the active request
                if (this.activeRequestId !== currentRequestId) {
                    console.warn('Request cancelled - newer request in progress');
                    return;
                }
                
                const data = await response.json();
                if (data.responses && data.responses[0]) {
                    // Update the response in place
                    this.activeLoom.responses[index] = {
                        ...data.responses[0],
                        regenerated: true,
                        originalModel: this.activeLoom.responses[index].model
                    };
                    
                    // Update the card content
                    this.updateCompletionCard(index);
                    this.showNotification('Response regenerated successfully');
                } else {
                    throw new Error('No response received');
                }
            } catch (error) {
                console.error('Regeneration failed:', error);
                this.showNotification('Failed to regenerate response', 'error');
            } finally {
                // Only reset if this is still the active request
                if (this.activeRequestId === currentRequestId) {
                    this.isGenerating = false;
                    this.activeRequestId = null;
                    card.classList.remove('regenerating');
                }
            }
        } else {
            // Socket.io mode
            // Store the index for when we receive the response
            this.pendingRegenerationIndex = index;
            
            this.socket.emit('generate', {
                systemPrompt: document.getElementById('systemPrompt').value,
                messages: messagesToSend,
                models: [model],
                temperature,
                maxTokens,
                isSingleRegeneration: true
            });
            
            // For Socket.io, we'll reset the state when we receive the response
            // But still remove the regenerating class
            setTimeout(() => {
                card.classList.remove('regenerating');
                this.isGenerating = false;
                this.activeRequestId = null;
            }, 100);
        }
    }
    
    updateCompletionCard(index) {
        const card = document.querySelector(`.completion-card[data-index="${index}"]`);
        const response = this.activeLoom.responses[index];
        
        // Update model name
        card.querySelector('.completion-model').textContent = 
            `${response.model || 'Unknown'}${response.edited ? ' (edited)' : ''}${response.regenerated ? ' (regenerated)' : ''}`;
        
        // Update content
        card.querySelector('.completion-content').innerHTML = this.escapeHtml(response.content);
        
        // Update token count if available
        if (response.usage) {
            card.querySelector('.completion-stats').textContent = `${response.usage.total_tokens} tokens`;
        }
    }
    
    async saveConversation(autoSave = false) {
        if (!this.currentBin || this.currentMessages.length < 2) {
            if (!autoSave) alert('Nothing to save');
            return;
        }
        
        const isNewConversation = !this.currentConversationId;
        const conversationId = this.currentConversationId || Date.now().toString();
        
        const conversation = {
            id: conversationId,
            binId: this.currentBin.id,
            name: this.currentConversationName || this.getConversationPreview({ messages: this.currentMessages }),
            description: this.currentConversationDescription || '',
            messages: [
                { role: 'system', content: document.getElementById('systemPrompt').value },
                ...this.currentMessages
            ],
            metadata: {
                createdAt: isNewConversation ? new Date().toISOString() : undefined,
                updatedAt: new Date().toISOString(),
                turnCount: Math.floor(this.currentMessages.length / 2),
                models: this.selectedModels,
                lastModel: this.currentMessages[this.currentMessages.length - 1]?.model
            }
        };
        
        if (this.isCloudflare) {
            try {
                const endpoint = isNewConversation 
                    ? `${this.apiBase}/conversations`
                    : `${this.apiBase}/conversations/${conversationId}`;
                    
                const response = await fetch(endpoint, {
                    method: isNewConversation ? 'POST' : 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(conversation)
                });
                
                if (response.ok) {
                    const savedConv = await response.json();
                    
                    if (isNewConversation) {
                        this.currentConversationId = savedConv.id;
                        this.conversations.push(savedConv);
                        this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
                        // Enable delete button for new conversation
                        document.getElementById('deleteConversation').disabled = false;
                    } else {
                        // Update existing conversation in list
                        const index = this.conversations.findIndex(c => c.id === conversationId);
                        if (index > -1) {
                            this.conversations[index] = savedConv;
                        }
                    }
                    
                    this.updateStats();
                    
                    // Update the conversation in the UI
                    if (this.currentBin) {
                        if (isNewConversation) {
                            // For new conversations, reload the list to add it
                            await this.loadConversationsForBin(this.currentBin.id);
                        } else {
                            // For existing conversations, just update the name and turn count
                            this.updateConversationNameInLists(conversationId, savedConv.name || this.currentConversationName);
                        }
                    }
                    
                    if (!autoSave) {
                        this.showNotification('Conversation saved to dataset');
                        // Don't clear the conversation on manual save, just disable the save button
                        document.getElementById('saveConversation').disabled = true;
                        // Enable delete button after save
                        document.getElementById('deleteConversation').disabled = false;
                    }
                }
            } catch (error) {
                console.error('Failed to save conversation:', error);
                if (!autoSave) alert('Failed to save conversation');
            }
        } else {
            // Local storage mode
            const allConvs = JSON.parse(localStorage.getItem('tuneforge_conversations') || '[]');
            
            if (isNewConversation) {
                this.currentConversationId = conversationId;
                allConvs.push(conversation);
                this.conversations.push(conversation);
                this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
                // Enable delete button for new conversation
                document.getElementById('deleteConversation').disabled = false;
            } else {
                // Update existing
                const index = allConvs.findIndex(c => c.id === conversationId);
                if (index > -1) {
                    allConvs[index] = conversation;
                }
                const localIndex = this.conversations.findIndex(c => c.id === conversationId);
                if (localIndex > -1) {
                    this.conversations[localIndex] = conversation;
                }
            }
            
            localStorage.setItem('tuneforge_conversations', JSON.stringify(allConvs));
            
            // Update bin
            const bins = JSON.parse(localStorage.getItem('tuneforge_bins') || '[]');
            const binIndex = bins.findIndex(b => b.id === this.currentBin.id);
            if (binIndex > -1) {
                bins[binIndex] = this.currentBin;
                localStorage.setItem('tuneforge_bins', JSON.stringify(bins));
            }
            
            this.updateStats();
            
            // Update the conversation in the UI
            if (this.currentBin) {
                if (isNewConversation) {
                    // For new conversations, reload the list to add it
                    await this.loadConversationsForBin(this.currentBin.id);
                } else {
                    // For existing conversations, just update the name and turn count
                    this.updateConversationNameInLists(conversationId, conversation.name || this.currentConversationName);
                }
            }
            
            if (!autoSave) {
                this.showNotification('Conversation saved to dataset');
                document.getElementById('saveConversation').disabled = true;
                // Enable delete button after save
                document.getElementById('deleteConversation').disabled = false;
            }
        }
    }
    
    async deleteConversation() {
        if (!this.currentBin || !this.currentConversationId) {
            return;
        }
        
        const conversationName = this.currentConversationName || 'this conversation';
        if (!confirm(`Delete "${conversationName}"? This cannot be undone.`)) {
            return;
        }
        
        if (this.isCloudflare) {
            try {
                const response = await fetch(`${this.apiBase}/conversations/${this.currentConversationId}?binId=${this.currentBin.id}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    // Remove from local conversations array
                    this.conversations = this.conversations.filter(c => c.id !== this.currentConversationId);
                    
                    // Update bin conversation count
                    if (this.currentBin.conversationCount > 0) {
                        this.currentBin.conversationCount--;
                    }
                    
                    // Refresh the conversation list in the UI
                    await this.loadConversationsForBin(this.currentBin.id);
                    
                    // Clear current conversation and start new
                    this.clearConversation();
                    this.updateStats();
                    this.showNotification('Conversation deleted successfully');
                } else {
                    this.showNotification('Failed to delete conversation', 'error');
                }
            } catch (error) {
                console.error('Failed to delete conversation:', error);
                this.showNotification('Failed to delete conversation', 'error');
            }
        } else {
            // Local storage mode
            const allConvs = JSON.parse(localStorage.getItem('tuneforge_conversations') || '[]');
            const filtered = allConvs.filter(c => c.id !== this.currentConversationId);
            localStorage.setItem('tuneforge_conversations', JSON.stringify(filtered));
            
            // Remove from current conversations
            this.conversations = this.conversations.filter(c => c.id !== this.currentConversationId);
            
            // Update bin conversation count
            if (this.currentBin.conversationCount > 0) {
                this.currentBin.conversationCount--;
                
                const bins = JSON.parse(localStorage.getItem('tuneforge_bins') || '[]');
                const binIndex = bins.findIndex(b => b.id === this.currentBin.id);
                if (binIndex > -1) {
                    bins[binIndex] = this.currentBin;
                    localStorage.setItem('tuneforge_bins', JSON.stringify(bins));
                }
            }
            
            // Refresh the conversation list in the UI
            await this.loadConversationsForBin(this.currentBin.id);
            
            // Clear current conversation and start new
            this.clearConversation();
            this.updateStats();
            this.showNotification('Conversation deleted successfully');
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
    async regenerateAll() {
        // Prevent duplicate calls
        if (this.isGenerating) {
            this.showNotification('Please wait for the current request to complete', 'warning');
            return;
        }
        
        // Find the last assistant message
        const lastAssistantIndex = this.currentMessages.findLastIndex(m => m.role === 'assistant');
        if (lastAssistantIndex === -1) {
            this.showNotification('No assistant message to regenerate', 'error');
            return;
        }
        
        // Set generating flag
        this.isGenerating = true;
        this.activeRequestId = Date.now().toString();
        this.disableGenerationUI();
        
        // Get messages up to (but not including) the last assistant message
        const messagesToSend = this.currentMessages.slice(0, lastAssistantIndex);
        
        if (messagesToSend.length === 0) {
            this.showNotification('No messages to regenerate', 'error');
            return;
        }
        
        // Show loading state
        this.showNotification('Regenerating all responses...');
        
        // Get current parameters
        const temperature = parseFloat(document.getElementById('temperature').value);
        const maxTokens = parseInt(document.getElementById('maxTokensValue').textContent);
        
        // Remove the last assistant message from UI
        const flow = document.getElementById('conversationFlow');
        const messageBlocks = flow.querySelectorAll('.message-block');
        let lastAssistantBlock = null;
        
        // Find and remove the last assistant message block
        for (let i = messageBlocks.length - 1; i >= 0; i--) {
            if (messageBlocks[i].querySelector('.message.assistant')) {
                lastAssistantBlock = messageBlocks[i];
                break;
            }
        }
        
        if (lastAssistantBlock) {
            lastAssistantBlock.remove();
        }
        
        // Remove from messages array
        this.currentMessages = this.currentMessages.slice(0, lastAssistantIndex);
        
        // Show loading loom
        this.showLoomLoading();
        
        // Regenerate with all selected models
        if (this.isCloudflare) {
            const currentRequestId = this.activeRequestId;
            try {
                const generateParams = {
                    binId: this.currentBin.id,
                    systemPrompt: document.getElementById('systemPrompt').value,
                    messages: messagesToSend,
                    models: this.selectedModels
                };
                
                // Check if any selected model is o3/o4-mini
                const hasO3Models = this.selectedModels.some(modelId => 
                    modelId.includes('o3') || modelId.includes('o4-mini')
                );
                
                if (hasO3Models) {
                    generateParams.max_completion_tokens = maxTokens;
                } else {
                    generateParams.temperature = temperature;
                    generateParams.maxTokens = maxTokens;
                }
                
                const response = await fetch(`${this.apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(generateParams)
                });
                
                // Check if this is still the active request
                if (this.activeRequestId !== currentRequestId) {
                    console.warn('Request cancelled - newer request in progress');
                    return;
                }
                
                const data = await response.json();
                this.handleResponses({ responses: data.responses });
                
            } catch (error) {
                console.error('Failed to regenerate:', error);
                this.showNotification('Failed to regenerate responses', 'error');
                // Remove loading loom
                const loadingLoom = flow.querySelector('.loading-loom');
                if (loadingLoom) loadingLoom.remove();
            } finally {
                // Only reset if this is still the active request
                if (this.activeRequestId === currentRequestId) {
                    this.isGenerating = false;
                    this.activeRequestId = null;
                    this.enableGenerationUI();
                }
            }
        } else {
            // Socket.io mode
            this.socket.emit('generate', {
                systemPrompt: document.getElementById('systemPrompt').value,
                messages: messagesToSend,
                models: this.selectedModels,
                temperature,
                maxTokens
            });
        }
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
                // Prepare base parameters
                const generateParams = {
                    binId: this.currentBin.id,
                    systemPrompt: document.getElementById('systemPrompt').value,
                    messages: messagesToSend,
                    models: this.selectedModels
                };
                
                // Check if any selected model is o3/o4-mini
                const hasO3Models = this.selectedModels.some(modelId => 
                    modelId.includes('o3') || modelId.includes('o4-mini')
                );
                
                if (hasO3Models) {
                    // For o3/o4-mini models, only include supported parameters
                    generateParams.max_completion_tokens = params.maxTokens;
                    // Include variations if needed
                    if (params.variations) generateParams.variations = params.variations;
                    if (params.customPrompt) generateParams.customPrompt = params.customPrompt;
                } else {
                    // For standard models, include all parameters
                    Object.assign(generateParams, params);
                }
                
                const response = await fetch(`${this.apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(generateParams)
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
            // Socket.io mode - send appropriate parameters based on models
            const hasO3Models = this.selectedModels.some(modelId => 
                modelId.includes('o3') || modelId.includes('o4-mini')
            );
            
            const socketParams = {
                systemPrompt: document.getElementById('systemPrompt').value,
                messages: messagesToSend,
                models: this.selectedModels
            };
            
            if (hasO3Models) {
                socketParams.max_completion_tokens = params.maxTokens;
                if (params.variations) socketParams.variations = params.variations;
                if (params.customPrompt) socketParams.customPrompt = params.customPrompt;
            } else {
                Object.assign(socketParams, params);
            }
            
            this.socket.emit('regenerate', socketParams);
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
    
    disableGenerationUI() {
        // Disable all input controls during generation
        document.getElementById('userMessage').disabled = true;
        document.getElementById('sendMessage').disabled = true;
        document.getElementById('regenerateLast').disabled = true;
        
        // Add visual feedback
        document.getElementById('sendMessage').textContent = 'GENERATING...';
        document.getElementById('sendMessage').classList.add('generating');
        
        // Disable model selection
        document.querySelectorAll('.model-option').forEach(el => {
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
        });
    }
    
    enableGenerationUI() {
        // Re-enable all input controls
        document.getElementById('userMessage').disabled = false;
        document.getElementById('sendMessage').disabled = false;
        document.getElementById('regenerateLast').disabled = false;
        
        // Reset visual feedback
        document.getElementById('sendMessage').textContent = 'SEND';
        document.getElementById('sendMessage').classList.remove('generating');
        
        // Re-enable model selection
        document.querySelectorAll('.model-option').forEach(el => {
            el.style.pointerEvents = '';
            el.style.opacity = '';
        });
        
        // Focus back on input
        document.getElementById('userMessage').focus();
    }
    
    // Presence tracking methods
    handleUserJoined(data) {
        if (data.conversationId === this.currentConversationId && data.userId !== this.userId) {
            this.connectedUsers.set(data.userId, data);
            this.updatePresenceUI();
            this.showNotification(`${data.userName || 'Another user'} joined the conversation`, 'info');
        }
    }
    
    handleUserLeft(data) {
        if (data.userId !== this.userId) {
            this.connectedUsers.delete(data.userId);
            this.updatePresenceUI();
            this.showNotification(`${data.userName || 'A user'} left the conversation`, 'info');
        }
    }
    
    updateActiveUsers(users) {
        this.connectedUsers.clear();
        users.forEach(user => {
            if (user.userId !== this.userId && user.conversationId === this.currentConversationId) {
                this.connectedUsers.set(user.userId, user);
            }
        });
        this.updatePresenceUI();
    }
    
    updatePresenceUI() {
        const presenceEl = document.getElementById('presenceIndicator');
        if (!presenceEl) return;
        
        const userCount = this.connectedUsers.size;
        if (userCount > 0) {
            presenceEl.style.display = 'flex';
            presenceEl.innerHTML = `
                <span class="presence-dot"></span>
                <span class="presence-text">${userCount} other user${userCount > 1 ? 's' : ''} connected</span>
            `;
        } else {
            presenceEl.style.display = 'none';
        }
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