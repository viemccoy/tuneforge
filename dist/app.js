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
        
        // Rate limiting and request protection
        this.requestTimestamps = new Map();
        this.rateLimitWindow = 60000; // 1 minute
        this.maxRequestsPerWindow = 30;
        this.requestQueue = [];
        this.processingQueue = false;
        
        // Input validation limits
        this.maxMessageLength = 10000;
        this.maxConversationNameLength = 100;
        this.maxBinNameLength = 50;
        this.maxSystemPromptLength = 2000;
        
        // No session timeouts - sessions persist forever
        
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
        // Store user info
        this.currentUser = null;
        
        if (this.isCloudflare) {
            // Check if already authenticated
            try {
                const response = await this.fetchWithAuth(`${this.apiBase}/bins`);
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
        
        // Auth form handlers
        const authSubmitBtn = document.getElementById('authSubmit');
        if (authSubmitBtn) {
            authSubmitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Continue button clicked');
                this.authenticate();
            });
        } else {
            console.error('authSubmit button not found!');
        }
        
        document.getElementById('authEmail')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.authenticate();
            }
        });
        document.getElementById('authPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.authenticate();
            }
        });
        document.getElementById('authPasswordConfirm')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.authenticate();
            }
        });
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    }
    
    // Helper method for authenticated fetch requests
    async fetchWithAuth(url, options = {}) {
        const defaultOptions = {
            credentials: 'include', // Always include cookies
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };
        
        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            
            // Handle authentication errors globally
            if (response.status === 401) {
                this.handleAuthError();
                throw new Error('Authentication failed');
            }
            
            // Handle rate limiting
            if (response.status === 429) {
                const retryAfter = response.headers.get('Retry-After') || '60';
                throw new Error(`Rate limit exceeded. Try again in ${retryAfter} seconds.`);
            }
            
            return response;
        } catch (error) {
            // Network errors
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                throw new Error('Network error. Please check your connection.');
            }
            throw error;
        }
    }
    
    handleAuthError() {
        // Only show auth modal once
        if (!this.authErrorHandled) {
            this.authErrorHandled = true;
            this.showNotification('Authentication required. Please log in again.', 'error');
            setTimeout(() => {
                this.showAuthModal();
            }, 1000);
        }
    }
    
    async authenticate() {
        const emailInput = document.getElementById('authEmail');
        const passwordInput = document.getElementById('authPassword');
        const passwordConfirmInput = document.getElementById('authPasswordConfirm');
        const errorEl = document.getElementById('authError');
        const messageEl = document.getElementById('authMessage');
        const passwordFieldsDiv = document.getElementById('passwordFields');
        const authSubmitBtn = document.getElementById('authSubmit');

        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;

        const emailRegex = /^[^
@]+@[^
@]+\.[^
@]+$/;
        if (!email) {
            errorEl.textContent = 'Email required';
            return;
        }
        if (!emailRegex.test(email)) {
            errorEl.textContent = 'Please enter a valid email address.';
            return;
        }

        try {
            // State 1: Password fields are not yet visible. This is the first click.
            if (passwordFieldsDiv.style.display === 'none') {
                const checkResponse = await fetch(`${this.apiBase}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });

                const checkData = await checkResponse.json();

                if (!checkResponse.ok) {
                    errorEl.textContent = checkData.error || 'Invalid email address.';
                    return;
                }

                // Show the password fields container
                passwordFieldsDiv.style.display = 'block';
                passwordInput.style.display = 'block';
                passwordInput.focus();

                if (checkData.requiresPassword) {
                    // Case: New user or first-time login for existing user.
                    passwordConfirmInput.style.display = 'block';
                    document.getElementById('confirmLabel').style.display = 'block';
                    messageEl.textContent = checkData.message || 'Create your password';
                    authSubmitBtn.textContent = 'CREATE PASSWORD';
                } else {
                    // Case: Existing user with a password.
                    messageEl.textContent = checkData.message || 'Enter your password';
                    authSubmitBtn.textContent = 'LOGIN';
                }
                errorEl.textContent = '';
                return; // Wait for the user to enter password info.
            }

            // State 2: Password fields are visible. This is the second click.
            // We are either creating a password or logging in.

            if (passwordConfirmInput.style.display === 'block') {
                // Action: Create Password
                if (password !== passwordConfirm) {
                    errorEl.textContent = 'Passwords do not match';
                    return;
                }
                if (password.length < 8) {
                    errorEl.textContent = 'Password must be at least 8 characters';
                    return;
                }

                const createResponse = await fetch(`${this.apiBase}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password, passwordConfirm })
                });

                const createData = await createResponse.json();

                if (createData.success) {
                    this.currentUser = createData.user;
                    this.authenticated = true;
                    this.hideAuthModal();
                    this.showUserInfo(createData.user);
                    this.initialize();
                } else {
                    errorEl.textContent = createData.error || 'Password creation failed';
                }
            } else {
                // Action: Login
                if (!password) {
                    errorEl.textContent = 'Password required';
                    return;
                }

                const loginResponse = await fetch(`${this.apiBase}/auth`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password })
                });

                const loginData = await loginResponse.json();

                if (loginData.success) {
                    this.currentUser = loginData.user;
                    this.authenticated = true;
                    this.hideAuthModal();
                    this.showUserInfo(loginData.user);
                    this.initialize();
                } else {
                    errorEl.textContent = loginData.error || 'Invalid credentials';
                    passwordInput.value = '';
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            errorEl.textContent = 'Authentication failed. Please try again.';
        }
                    passwordInput.value = '';
                    passwordInput.focus();
                } else if (loginData.success) {
                    this.currentUser = loginData.user;
                    this.authenticated = true;
                    this.hideAuthModal();
                    this.showUserInfo(loginData.user);
                    this.initialize();
                } else {
                    errorEl.textContent = loginData.error || 'Invalid credentials';
                    passwordInput.value = '';
                }
            }
        } catch (error) {
            console.error('Auth error:', error);
            errorEl.textContent = 'Authentication failed';
        }
    }
    
    showUserInfo(user) {
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userEmail').textContent = user.email;
        document.getElementById('userTeam').textContent = `[${user.teamId}]`;
    }
    
    async logout() {
        try {
            await fetch(`${this.apiBase}/users`, {
                method: 'DELETE',
                credentials: 'include'
            });
        } catch (error) {
            console.error('Logout error:', error);
        }
        
        // Clear local state and reload
        this.authenticated = false;
        this.currentUser = null;
        window.location.reload();
    }
    
    showAuthModal() {
        document.getElementById('authModal').classList.add('active');
        document.getElementById('authEmail').focus();
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
        
        // Check for any pending messages that may have been lost
        this.checkPendingMessage();
        
        // Check for recovery data after bins are loaded
        const recoveryData = this.checkForRecoveryData();
        if (recoveryData) {
            const confirmed = await this.showConfirmDialog({
                title: 'Recover Previous Session',
                message: 'Found unsaved work from a previous session.',
                details: `${recoveryData.messages.length} messages in bin "${recoveryData.binId}"`,
                confirmText: 'RECOVER',
                cancelText: 'DISCARD'
            });
            
            if (confirmed) {
                await this.recoverConversation(recoveryData);
            } else {
                sessionStorage.removeItem('tuneforge_conversation_recovery');
            }
        }
        
        // No session monitoring - sessions persist forever
        
        // Network status monitoring
        this.setupNetworkMonitoring();
        
        // Start periodic saves
        this.startPeriodicSaves();
        
        // Clean up presence on page unload
        window.addEventListener('beforeunload', (e) => {
            if (this.currentConversationId && this.currentBin) {
                // Use sendBeacon for reliable cleanup on page close
                const data = JSON.stringify({
                    conversationId: this.currentConversationId,
                    userId: this.userId,
                    action: 'leave'
                });
                navigator.sendBeacon(`${this.apiBase}/presence`, data);
            }
            
            // Save conversation state one more time before unload
            if (this.currentMessages.length > 0) {
                this.saveConversationToSessionStorage();
                
                // If there's an active loom (unselected responses), warn the user
                if (this.activeLoom) {
                    e.preventDefault();
                    e.returnValue = 'You have unselected AI responses. Are you sure you want to leave?';
                    return e.returnValue;
                }
            }
            
            // Stop periodic saves
            this.stopPeriodicSaves();
        });
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
                const response = await this.fetchWithAuth(`${this.apiBase}/bins`);
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
        if (!convList) {
            console.error(`Conversation list not found for bin ${binId}`);
            return;
        }
        
        convList.innerHTML = '<div class="loading-state">Loading conversations...</div>';
        
        let conversations = [];
        
        if (this.isCloudflare) {
            try {
                const response = await this.fetchWithAuth(`${this.apiBase}/conversations?binId=${binId}`);
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
        
        // Merge with any placeholders for this bin
        const placeholders = this.conversations.filter(c => 
            c.binId === binId && 
            c.metadata?.isPlaceholder && 
            !conversations.find(conv => conv.name === c.name)
        );
        
        conversations = [...placeholders, ...conversations];
        
        // Sort conversations by creation date (newest first)
        conversations.sort((a, b) => new Date(b.metadata.createdAt) - new Date(a.metadata.createdAt));
        
        convList.innerHTML = '';
        
        if (conversations.length === 0) {
            convList.innerHTML = '<div class="empty-nested">No conversations yet</div>';
            return;
        }
        
        conversations.forEach(conv => {
            const convEl = document.createElement('div');
            convEl.className = 'conversation-file';
            convEl.dataset.conversationId = conv.id; // Add data attribute for easier lookup
            
            // Add new-conversation class for placeholders or just-created conversations
            if (conv.metadata?.isPlaceholder || 
                (conv.metadata?.createdAt && new Date(conv.metadata.createdAt) > new Date(Date.now() - 5000))) {
                convEl.classList.add('new-conversation');
            }
            
            // If this is the current conversation, mark it as current
            if (conv.id === this.currentConversationId || 
                (conv.metadata?.isPlaceholder && conv.name === this.currentConversationName)) {
                convEl.classList.add('current');
            }
            
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
            
            // Highlight if this is the current conversation
            if (conv.id === this.currentConversationId) {
                convEl.classList.add('current');
                // Flash animation for new conversations
                convEl.classList.add('new-conversation');
                setTimeout(() => convEl.classList.remove('new-conversation'), 1000);
            }
        });
    }
    
    async selectBin(bin, skipNewConversation = false) {
        // Stop tracking previous bin/conversation
        await this.stopPresenceTracking();
        
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
        
        // Start polling for presence in this bin
        if (this.isCloudflare) {
            // Just start the polling interval for bin presence
            if (this.presencePollingInterval) {
                clearInterval(this.presencePollingInterval);
            }
            this.presencePollingInterval = setInterval(() => {
                this.pollPresenceForBin();
            }, 5000);
            // Initial poll
            this.pollPresenceForBin();
        }
        
        // Start new conversation only if not loading a specific conversation
        if (!skipNewConversation) {
            await this.clearConversation();
        }
    }
    
    async loadBinConversations() {
        if (!this.currentBin) return;
        
        if (this.isCloudflare) {
            try {
                const response = await this.fetchWithAuth(`${this.apiBase}/conversations?binId=${this.currentBin.id}`);
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
        const nameInput = document.getElementById('binName').value;
        const systemPromptInput = document.getElementById('binSystemPrompt').value;
        const descriptionInput = document.getElementById('binDescription').value;
        
        // Validate inputs
        let name, systemPrompt, description;
        try {
            name = this.validateInput(nameInput, 'binName');
            systemPrompt = this.validateInput(systemPromptInput, 'systemPrompt');
            description = this.sanitizeInput(descriptionInput);
            
            if (!name || !systemPrompt) {
                throw new Error('Name and system prompt are required');
            }
        } catch (error) {
            this.showNotification(error.message, 'error');
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
                const response = await this.fetchWithAuth(`${this.apiBase}/bins`, {
                    method: 'POST',
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
        
        // Count conversations in this bin
        const convCount = this.conversations.length;
        const turnCount = this.conversations.reduce((sum, conv) => 
            sum + (conv.metadata?.turnCount || 0), 0);
        
        const confirmed = await this.showConfirmDialog({
            title: 'Delete Bin',
            message: `Delete "${this.currentBin.name}"?`,
            details: `This will permanently delete ${convCount} conversation${convCount !== 1 ? 's' : ''} with ${turnCount} total turns.`,
            confirmText: 'DELETE',
            dangerous: true
        });
        
        if (!confirmed) return;
        
        console.log('Deleting bin:', this.currentBin.id);
        this.showLoadingOverlay('Deleting bin...');
        
        if (this.isCloudflare) {
            try {
                const response = await this.fetchWithAuth(`${this.apiBase}/bins/${this.currentBin.id}`, {
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
            } finally {
                this.hideLoadingOverlay();
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
                { id: 'x-ai/grok-3', name: 'Grok 3', provider: 'openrouter' },
                { id: 'x-ai/grok-3-mini', name: 'Grok 3 Mini', provider: 'openrouter' },
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
    async loadConversation(conversation) {
        // Stop tracking previous conversation
        await this.stopPresenceTracking();
        
        // Clear any active loom from previous conversation
        this.activeLoom = null;
        
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
        
        // Start presence tracking for new conversation
        await this.startPresenceTracking();
        
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
        this.activeLoom = null; // Clear any existing loom
        
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
        
        // Create a placeholder conversation that will show in the bin immediately
        const placeholderConv = {
            id: 'temp_' + Date.now(),
            binId: this.currentBin.id,
            name: nameInput,
            description: description,
            messages: [],
            metadata: {
                createdAt: new Date().toISOString(),
                turnCount: 0,
                isPlaceholder: true
            }
        };
        
        // Add to conversations array temporarily
        this.conversations.push(placeholderConv);
        
        // Update bin count and refresh the list to show the new conversation
        this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
        this.updateBinCount(this.currentBin.id, this.currentBin.conversationCount);
        
        // Ensure bin is expanded and refresh list
        const convList = document.getElementById(`convList-${this.currentBin.id}`);
        if (convList) {
            if (convList.style.display === 'none') {
                await this.toggleBinExpanded(this.currentBin.id);
            } else {
                await this.loadConversationsForBin(this.currentBin.id);
            }
        }
        
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
    
    async clearConversation() {
        // Stop presence tracking
        await this.stopPresenceTracking();
        
        // Clear any active loom
        this.activeLoom = null;
        
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
        
        // Check if there's an active loom (unselected responses)
        if (this.activeLoom) {
            this.showNotification('Please select a response before sending a new message', 'warning');
            // Focus the loom for keyboard navigation
            const loomElement = this.activeLoom.element.querySelector('.completion-loom');
            if (loomElement) {
                loomElement.focus();
                // Pulse the loom to draw attention
                loomElement.style.animation = 'none';
                setTimeout(() => {
                    loomElement.style.animation = 'loomPulse 0.5s ease-out';
                }, 10);
            }
            return;
        }
        
        if (!this.currentBin) {
            alert('Please select a bin first');
            return;
        }
        
        const messageInput = document.getElementById('userMessage').value;
        
        // Validate and sanitize input
        let message;
        try {
            message = this.validateInput(messageInput, 'message');
        } catch (error) {
            this.showNotification(error.message, 'error');
            return;
        }
        
        if (this.selectedModels.length === 0) {
            this.showNotification('Please select at least one model', 'warning');
            return;
        }
        
        // Check rate limit
        try {
            this.checkRateLimit('generate');
        } catch (error) {
            this.showNotification(error.message, 'error');
            return;
        }
        
        // Save message to temporary storage in case of failure
        const messageBackup = {
            content: message,
            timestamp: Date.now(),
            binId: this.currentBin.id,
            conversationId: this.currentConversationId
        };
        sessionStorage.setItem('tuneforge_pending_message', JSON.stringify(messageBackup));
        
        // Set generating flag and disable UI
        this.isGenerating = true;
        this.activeRequestId = Date.now().toString();
        this.disableGenerationUI();
        
        // Log message state for debugging
        console.log('[TuneForge] Sending message:', {
            messageIndex: this.currentMessages.length,
            content: message.substring(0, 50) + '...',
            binId: this.currentBin.id,
            conversationId: this.currentConversationId,
            timestamp: new Date().toISOString()
        });
        
        // Add user message
        this.currentMessages.push({ role: 'user', content: message });
        this.addMessageToUI({ role: 'user', content: message });
        
        // Save to session storage after adding user message
        this.saveConversationToSessionStorage();
        
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
                const response = await this.fetchWithAuth(`${this.apiBase}/generate`, {
                    method: 'POST',
                    body: JSON.stringify(generateParams)
                });
                
                // Check if this is still the active request
                if (this.activeRequestId !== currentRequestId) {
                    console.warn('Request cancelled - newer request in progress');
                    return;
                }
                
                // Check response status first
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error: ${response.status} - ${errorText}`);
                }
                
                // Try to parse JSON with error handling
                let data;
                const responseText = await response.text();
                try {
                    data = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('Failed to parse API response:', responseText);
                    throw new Error('Invalid response format from API');
                }
                
                this.handleResponses({ responses: data.responses || [] });
            } catch (error) {
                console.error('Failed to generate responses:', error);
                this.showNotification('Failed to generate responses - your message has been saved', 'error');
                
                // Log error details for debugging
                console.error('[TuneForge] Response generation failed:', {
                    error: error.message,
                    messageCount: this.currentMessages.length,
                    timestamp: new Date().toISOString()
                });
                
                // Remove loading state
                const flow = document.getElementById('conversationFlow');
                const loadingEl = flow.querySelector('.loading-loom');
                if (loadingEl) loadingEl.remove();
                
                // Add error indicator to the last message
                const lastMessageBlock = flow.lastElementChild;
                if (lastMessageBlock && !lastMessageBlock.querySelector('.message-error')) {
                    const errorIndicator = document.createElement('div');
                    errorIndicator.className = 'message-error';
                    errorIndicator.innerHTML = '⚠ Failed to generate response - message saved';
                    lastMessageBlock.appendChild(errorIndicator);
                }
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
        
        // Log response handling for debugging
        console.log('[TuneForge] Handling responses:', {
            responseCount: data.responses?.length || 0,
            messageCount: this.currentMessages.length,
            timestamp: new Date().toISOString()
        });
        
        const flow = document.getElementById('conversationFlow');
        const loadingEl = flow.querySelector('.loading-loom');
        if (loadingEl) loadingEl.remove();
        
        if (!data.responses || data.responses.length === 0) {
            this.showNotification('No responses generated - your message has been saved', 'error');
            
            // Add recovery option
            const recoveryEl = document.createElement('div');
            recoveryEl.className = 'message-recovery';
            recoveryEl.innerHTML = `
                <button class="btn-recovery" onclick="app.retryLastMessage()">↻ Retry</button>
                <button class="btn-recovery" onclick="app.removeLastMessage()">✕ Remove</button>
            `;
            flow.appendChild(recoveryEl);
            return;
        }
        
        // Clear pending message backup on successful response
        sessionStorage.removeItem('tuneforge_pending_message');
        
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
            currentIndex: 0,
            createdAt: Date.now()
        };
        
        // Log unselected loom for debugging
        console.log('[TuneForge] Loom created with responses:', {
            responseCount: data.responses.length,
            models: data.responses.map(r => r.model),
            messageCount: this.currentMessages.length,
            timestamp: new Date().toISOString()
        });
        
        // Save pending loom to session storage
        const pendingLoom = {
            responses: data.responses,
            messageCountBeforeLoom: this.currentMessages.length,
            createdAt: Date.now()
        };
        sessionStorage.setItem('tuneforge_pending_loom', JSON.stringify(pendingLoom));
        
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
        
        // Auto-save conversation state periodically
        if (this.currentMessages.length > 0 && this.currentMessages.length % 4 === 0) {
            console.log('[TuneForge] Auto-saving conversation state');
            this.saveConversation(true);
        }
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
                                <label>Temperature <span class="value-display" id="regen-temp-val-${index}">${document.getElementById('temperature').value}</span></label>
                                <input type="range" id="regen-temp-${index}" min="0" max="2" step="0.1" value="${document.getElementById('temperature').value}" oninput="document.getElementById('regen-temp-val-${index}').textContent = this.value">
                                <span class="param-help">Randomness (0=deterministic, 2=creative)</span>
                            </div>
                            <div class="control-group">
                                <label>Max Tokens</label>
                                <input type="number" id="regen-tokens-${index}" min="100" max="8000" value="${document.getElementById('maxTokensValue').textContent}" class="token-input">
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
        
        // Log selection for debugging
        console.log('[TuneForge] Selecting response:', {
            index,
            model: response.model,
            messageCount: this.currentMessages.length,
            conversationId: this.currentConversationId,
            timestamp: new Date().toISOString()
        });
        
        // Add to messages
        this.currentMessages.push({
            role: 'assistant',
            content: response.content,
            model: response.model
        });
        
        // Save to session storage immediately for recovery
        this.saveConversationToSessionStorage();
        
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
        
        // Clear pending loom from session storage
        sessionStorage.removeItem('tuneforge_pending_loom');
        
        // Auto-save the conversation after selecting a response
        console.log('[TuneForge] Auto-saving after response selection');
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
        // Reset all settings to current UI values
        const currentTemp = document.getElementById('temperature').value;
        const currentMaxTokens = document.getElementById('maxTokensValue').textContent;
        
        document.getElementById(`regen-temp-${index}`).value = currentTemp;
        document.getElementById(`regen-temp-val-${index}`).textContent = currentTemp;
        document.getElementById(`regen-tokens-${index}`).value = currentMaxTokens;
        document.getElementById(`regen-top-p-${index}`).value = 1.0;
        document.getElementById(`regen-top-p-val-${index}`).textContent = '1.0';
        document.getElementById(`regen-freq-${index}`).value = 0;
        document.getElementById(`regen-freq-val-${index}`).textContent = '0.0';
        document.getElementById(`regen-pres-${index}`).value = 0;
        document.getElementById(`regen-pres-val-${index}`).textContent = '0.0';
        document.getElementById(`regen-model-${index}`).value = 'same';
        document.getElementById(`regen-instructions-${index}`).value = '';
        document.getElementById(`regen-variations-${index}`).value = '1';
        
        this.showNotification('Settings reset to current values');
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
                
                const response = await this.fetchWithAuth(`${this.apiBase}/generate`, {
                    method: 'POST',
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
                    
                const response = await this.fetchWithAuth(endpoint, {
                    method: isNewConversation ? 'POST' : 'PUT',
                    body: JSON.stringify(conversation)
                });
                
                if (response.ok) {
                    const savedConv = await response.json();
                    
                    if (isNewConversation) {
                        this.currentConversationId = savedConv.id;
                        
                        // Remove placeholder if it exists
                        const placeholderIndex = this.conversations.findIndex(c => 
                            c.metadata?.isPlaceholder && c.name === this.currentConversationName
                        );
                        if (placeholderIndex > -1) {
                            // Replace placeholder with real conversation
                            this.conversations[placeholderIndex] = savedConv;
                            // Don't increment count since we already did when creating placeholder
                        } else {
                            // No placeholder, this is a direct save
                            this.conversations.push(savedConv);
                            this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
                        }
                        
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
                            // Update bin count in UI immediately
                            this.updateBinCount(this.currentBin.id, this.currentBin.conversationCount);
                            
                            // Ensure bin is expanded to show new conversation
                            const convList = document.getElementById(`convList-${this.currentBin.id}`);
                            if (convList && convList.style.display === 'none') {
                                await this.toggleBinExpanded(this.currentBin.id);
                            } else {
                                // For new conversations, reload the list to add it
                                await this.loadConversationsForBin(this.currentBin.id);
                            }
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
                
                // Remove placeholder if it exists
                const placeholderIndex = this.conversations.findIndex(c => 
                    c.metadata?.isPlaceholder && c.name === this.currentConversationName
                );
                if (placeholderIndex > -1) {
                    // Replace placeholder with real conversation
                    this.conversations[placeholderIndex] = conversation;
                    // Don't increment count since we already did when creating placeholder
                } else {
                    // No placeholder, this is a direct save
                    this.conversations.push(conversation);
                    this.currentBin.conversationCount = (this.currentBin.conversationCount || 0) + 1;
                }
                
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
                    // Update bin count in UI immediately
                    this.updateBinCount(this.currentBin.id, this.currentBin.conversationCount);
                    
                    // Ensure bin is expanded to show new conversation
                    const convList = document.getElementById(`convList-${this.currentBin.id}`);
                    if (convList && convList.style.display === 'none') {
                        await this.toggleBinExpanded(this.currentBin.id);
                    } else {
                        // For new conversations, reload the list to add it
                        await this.loadConversationsForBin(this.currentBin.id);
                    }
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
        const turnCount = Math.floor(this.currentMessages.length / 2);
        
        const confirmed = await this.showConfirmDialog({
            title: 'Delete Conversation',
            message: `Delete "${conversationName}"?`,
            details: `This conversation has ${turnCount} turn${turnCount !== 1 ? 's' : ''} and will be permanently deleted.`,
            confirmText: 'DELETE',
            dangerous: true
        });
        
        if (!confirmed) return;
        
        if (this.isCloudflare) {
            try {
                const response = await this.fetchWithAuth(`${this.apiBase}/conversations/${this.currentConversationId}?binId=${this.currentBin.id}`, {
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
                
                const response = await this.fetchWithAuth(`${this.apiBase}/generate`, {
                    method: 'POST',
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
                
                const response = await this.fetchWithAuth(`${this.apiBase}/generate`, {
                    method: 'POST',
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
    
    updateBinCount(binId, count) {
        // Update the bin count display immediately
        const binEl = document.querySelector(`[data-bin-id="${binId}"]`);
        if (binEl) {
            const countEl = binEl.querySelector('.bin-count');
            if (countEl) {
                countEl.textContent = count;
            }
        }
        
        // Also update in the bins list
        const binIndex = this.bins.findIndex(b => b.id === binId);
        if (binIndex > -1) {
            this.bins[binIndex].conversationCount = count;
        }
    }
    
    updateConversationNameInLists(conversationId, newName) {
        // Update name in all conversation lists
        const nameElements = document.querySelectorAll(`[data-conv-name="${conversationId}"]`);
        nameElements.forEach(el => {
            el.textContent = newName;
        });
        
        // Also update any conversation items with this ID
        const convItems = document.querySelectorAll(`[data-conversation-id="${conversationId}"]`);
        convItems.forEach(item => {
            const nameEl = item.querySelector('.file-name');
            if (nameEl) nameEl.textContent = newName;
        });
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
    
    // Periodic saves
    startPeriodicSaves() {
        // Save every 30 seconds if there's an active conversation
        this.periodicSaveInterval = setInterval(() => {
            if (this.currentMessages.length > 0) {
                this.saveConversationToSessionStorage();
            }
        }, 30000);
    }
    
    stopPeriodicSaves() {
        if (this.periodicSaveInterval) {
            clearInterval(this.periodicSaveInterval);
            this.periodicSaveInterval = null;
        }
    }
    
    // Session storage methods for recovery
    saveConversationToSessionStorage() {
        if (!this.currentBin || !this.currentMessages.length) return;
        
        const recoveryData = {
            binId: this.currentBin.id,
            conversationId: this.currentConversationId,
            conversationName: this.currentConversationName,
            conversationDescription: this.currentConversationDescription,
            messages: this.currentMessages,
            systemPrompt: document.getElementById('systemPrompt').value,
            timestamp: Date.now()
        };
        
        sessionStorage.setItem('tuneforge_conversation_recovery', JSON.stringify(recoveryData));
        console.log('[TuneForge] Saved conversation to session storage for recovery');
    }
    
    checkForRecoveryData() {
        const recoveryDataStr = sessionStorage.getItem('tuneforge_conversation_recovery');
        if (!recoveryDataStr) return false;
        
        try {
            const recoveryData = JSON.parse(recoveryDataStr);
            const age = Date.now() - recoveryData.timestamp;
            
            // Only offer recovery if data is less than 1 hour old
            if (age > 3600000) {
                sessionStorage.removeItem('tuneforge_conversation_recovery');
                return false;
            }
            
            return recoveryData;
        } catch (error) {
            console.error('Failed to parse recovery data:', error);
            sessionStorage.removeItem('tuneforge_conversation_recovery');
            return false;
        }
    }
    
    async recoverConversation(recoveryData) {
        console.log('[TuneForge] Recovering conversation:', {
            binId: recoveryData.binId,
            messageCount: recoveryData.messages.length,
            age: Date.now() - recoveryData.timestamp
        });
        
        // Select the bin
        const bin = this.bins.find(b => b.id === recoveryData.binId);
        if (bin) {
            await this.selectBin(bin.id);
        }
        
        // Restore messages
        this.currentMessages = recoveryData.messages;
        this.currentConversationId = recoveryData.conversationId;
        this.currentConversationName = recoveryData.conversationName || '';
        this.currentConversationDescription = recoveryData.conversationDescription || '';
        
        // Restore system prompt
        if (recoveryData.systemPrompt) {
            document.getElementById('systemPrompt').value = recoveryData.systemPrompt;
        }
        
        // Rebuild UI
        document.getElementById('conversationFlow').innerHTML = '';
        this.currentMessages.forEach(msg => this.addMessageToUI(msg));
        
        // Update UI state
        this.updateConversationNameDisplay();
        document.getElementById('saveConversation').disabled = false;
        document.getElementById('deleteConversation').disabled = !!this.currentConversationId;
        
        // Update turn count
        const turnCount = Math.floor(this.currentMessages.length / 2);
        document.getElementById('turnCount').textContent = turnCount;
        
        this.showNotification('Conversation recovered from previous session', 'success');
        
        // Clear recovery data
        sessionStorage.removeItem('tuneforge_conversation_recovery');
    }
    
    // Enhanced confirmation dialog system
    async showConfirmDialog(options) {
        return new Promise((resolve) => {
            const {
                title = 'Confirm Action',
                message = 'Are you sure?',
                details = '',
                confirmText = 'CONFIRM',
                cancelText = 'CANCEL',
                dangerous = false
            } = options;
            
            // Create modal overlay
            const modal = document.createElement('div');
            modal.className = 'confirm-modal-overlay active';
            
            modal.innerHTML = `
                <div class="confirm-modal ${dangerous ? 'dangerous' : ''}">
                    <div class="confirm-header">
                        <h3>${this.escapeHtml(title)}</h3>
                        <div class="confirm-glow"></div>
                    </div>
                    <div class="confirm-body">
                        <p class="confirm-message">${this.escapeHtml(message)}</p>
                        ${details ? `<div class="confirm-details">${this.escapeHtml(details)}</div>` : ''}
                    </div>
                    <div class="confirm-actions">
                        <button class="btn btn-cancel" id="confirmCancel">${cancelText}</button>
                        <button class="btn btn-confirm ${dangerous ? 'btn-danger' : ''}" id="confirmOk">${confirmText}</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Focus confirm button for keyboard navigation
            setTimeout(() => {
                document.getElementById('confirmOk').focus();
            }, 100);
            
            // Event handlers
            const cleanup = () => {
                modal.classList.remove('active');
                setTimeout(() => modal.remove(), 300);
            };
            
            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };
            
            const handleCancel = () => {
                cleanup();
                resolve(false);
            };
            
            // Add event listeners
            document.getElementById('confirmOk').addEventListener('click', handleConfirm);
            document.getElementById('confirmCancel').addEventListener('click', handleCancel);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) handleCancel();
            });
            
            // Keyboard shortcuts
            const handleKeydown = (e) => {
                if (e.key === 'Escape') handleCancel();
                if (e.key === 'Enter') handleConfirm();
            };
            document.addEventListener('keydown', handleKeydown);
            
            // Cleanup keyboard listener when modal closes
            modal.addEventListener('transitionend', () => {
                if (!modal.classList.contains('active')) {
                    document.removeEventListener('keydown', handleKeydown);
                }
            });
        });
    }
    
    // Loading overlay system
    showLoadingOverlay(message = 'Processing...') {
        // Remove any existing overlay
        this.hideLoadingOverlay();
        
        const overlay = document.createElement('div');
        overlay.id = 'loadingOverlay';
        overlay.className = 'loading-overlay active';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner">
                    <div class="spinner-ring"></div>
                    <div class="spinner-ring"></div>
                    <div class="spinner-ring"></div>
                </div>
                <div class="loading-message">${this.escapeHtml(message)}</div>
                <div class="loading-progress">
                    <div class="progress-bar"></div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }
    
    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => overlay.remove(), 300);
        }
    }
    
    // Rate limiting and validation
    checkRateLimit(endpoint) {
        const now = Date.now();
        const key = `${endpoint}:${this.userId}`;
        const timestamps = this.requestTimestamps.get(key) || [];
        
        // Remove old timestamps outside the window
        const validTimestamps = timestamps.filter(ts => now - ts < this.rateLimitWindow);
        
        if (validTimestamps.length >= this.maxRequestsPerWindow) {
            const oldestTimestamp = validTimestamps[0];
            const waitTime = Math.ceil((this.rateLimitWindow - (now - oldestTimestamp)) / 1000);
            throw new Error(`Rate limit exceeded. Please wait ${waitTime} seconds.`);
        }
        
        // Add current timestamp
        validTimestamps.push(now);
        this.requestTimestamps.set(key, validTimestamps);
        
        return true;
    }
    
    validateInput(input, type) {
        // Sanitize input first
        const sanitized = this.sanitizeInput(input);
        
        switch (type) {
            case 'message':
                if (sanitized.length > this.maxMessageLength) {
                    throw new Error(`Message too long. Maximum ${this.maxMessageLength} characters allowed.`);
                }
                if (sanitized.trim().length === 0) {
                    throw new Error('Message cannot be empty.');
                }
                break;
                
            case 'conversationName':
                if (sanitized.length > this.maxConversationNameLength) {
                    throw new Error(`Name too long. Maximum ${this.maxConversationNameLength} characters allowed.`);
                }
                if (!/^[\w\s\-\.]+$/.test(sanitized)) {
                    throw new Error('Name can only contain letters, numbers, spaces, hyphens, and periods.');
                }
                break;
                
            case 'binName':
                if (sanitized.length > this.maxBinNameLength) {
                    throw new Error(`Name too long. Maximum ${this.maxBinNameLength} characters allowed.`);
                }
                if (!/^[\w\s\-\.]+$/.test(sanitized)) {
                    throw new Error('Name can only contain letters, numbers, spaces, hyphens, and periods.');
                }
                break;
                
            case 'systemPrompt':
                if (sanitized.length > this.maxSystemPromptLength) {
                    throw new Error(`System prompt too long. Maximum ${this.maxSystemPromptLength} characters allowed.`);
                }
                break;
        }
        
        return sanitized;
    }
    
    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        
        // Remove any potential script tags or HTML
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .trim();
    }
    
    // Request queue management
    async queueRequest(fn, priority = 0) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ fn, resolve, reject, priority });
            this.requestQueue.sort((a, b) => b.priority - a.priority);
            
            if (!this.processingQueue) {
                this.processQueue();
            }
        });
    }
    
    async processQueue() {
        if (this.processingQueue || this.requestQueue.length === 0) return;
        
        this.processingQueue = true;
        
        while (this.requestQueue.length > 0) {
            const { fn, resolve, reject } = this.requestQueue.shift();
            
            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            }
            
            // Small delay between requests to prevent overwhelming the server
            await new Promise(r => setTimeout(r, 100));
        }
        
        this.processingQueue = false;
    }
    
    // Session management
    startSessionMonitoring() {
        // Check session status every minute
        this.sessionCheckInterval = setInterval(() => {
            const elapsed = Date.now() - this.sessionStartTime;
            const timeUntilExpiry = this.sessionTimeout - elapsed;
            
            // Show warning when approaching timeout
            if (timeUntilExpiry <= this.sessionWarningTime && !this.sessionWarningShown) {
                this.sessionWarningShown = true;
                const minutesLeft = Math.ceil(timeUntilExpiry / 60000);
                
                this.showConfirmDialog({
                    title: 'Session Expiring Soon',
                    message: `Your session will expire in ${minutesLeft} minutes.`,
                    details: 'Save your work and refresh the page to continue.',
                    confirmText: 'REFRESH NOW',
                    cancelText: 'CONTINUE',
                    dangerous: false
                }).then(shouldRefresh => {
                    if (shouldRefresh) {
                        window.location.reload();
                    }
                });
            }
            
            // Force logout when session expires
            if (timeUntilExpiry <= 0) {
                clearInterval(this.sessionCheckInterval);
                this.handleSessionExpired();
            }
        }, 60000); // Check every minute
    }
    
    handleSessionExpired() {
        // Clear sensitive data
        this.currentMessages = [];
        this.currentConversationId = null;
        this.conversations = [];
        
        // Show expiry message
        this.showNotification('Session expired. Please log in again.', 'error');
        
        // Redirect to login after a short delay
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    }
    
    // Network monitoring
    setupNetworkMonitoring() {
        let wasOffline = false;
        
        // Check online status
        const updateOnlineStatus = () => {
            const isOnline = navigator.onLine;
            const statusEl = document.getElementById('connectionStatus');
            const dotEl = document.getElementById('connectionDot');
            
            if (isOnline) {
                if (wasOffline) {
                    this.showNotification('Connection restored', 'success');
                    wasOffline = false;
                    
                    // Refresh data after reconnection
                    if (this.currentBin) {
                        this.loadBinConversations();
                        this.pollPresenceForBin();
                    }
                }
                statusEl.textContent = 'CONNECTED';
                dotEl.classList.add('connected');
                dotEl.classList.remove('offline');
            } else {
                if (!wasOffline) {
                    this.showNotification('Connection lost. Working offline.', 'warning');
                    wasOffline = true;
                }
                statusEl.textContent = 'OFFLINE';
                dotEl.classList.remove('connected');
                dotEl.classList.add('offline');
            }
        };
        
        // Initial check
        updateOnlineStatus();
        
        // Listen for online/offline events
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        
        // Periodic connectivity check (more reliable than events)
        setInterval(() => {
            if (navigator.onLine) {
                // Try a lightweight request to verify actual connectivity
                fetch(`${this.apiBase}/health`, { method: 'HEAD' })
                    .then(() => updateOnlineStatus())
                    .catch(() => {
                        // Network request failed despite navigator.onLine = true
                        const statusEl = document.getElementById('connectionStatus');
                        statusEl.textContent = 'CONNECTION ISSUE';
                    });
            }
        }, 30000); // Check every 30 seconds
    }
    
    // Presence tracking methods
    async startPresenceTracking() {
        if (!this.currentConversationId || !this.currentBin) return;
        
        // Join the conversation
        await this.updatePresence('join');
        
        // Start heartbeat interval
        this.presenceInterval = setInterval(() => {
            this.updatePresence('heartbeat');
        }, 30000); // Every 30 seconds
        
        // Start polling for presence updates
        this.presencePollingInterval = setInterval(() => {
            this.pollPresenceForBin();
        }, 5000); // Every 5 seconds
        
        // Initial poll
        this.pollPresenceForBin();
    }
    
    async stopPresenceTracking() {
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
        
        if (this.presencePollingInterval) {
            clearInterval(this.presencePollingInterval);
            this.presencePollingInterval = null;
        }
        
        // Leave the conversation
        if (this.currentConversationId && this.currentBin) {
            await this.updatePresence('leave');
        }
    }
    
    async updatePresence(action) {
        if (!this.isCloudflare || !this.currentConversationId || !this.currentBin) return;
        
        try {
            await this.fetchWithAuth(`${this.apiBase}/presence`, {
                method: 'POST',
                body: JSON.stringify({
                    conversationId: this.currentConversationId,
                    userId: this.userId,
                    action: action
                })
            });
        } catch (error) {
            console.error('Failed to update presence:', error);
        }
    }
    
    async pollPresenceForBin() {
        if (!this.isCloudflare || !this.currentBin) return;
        
        try {
            const response = await this.fetchWithAuth(`${this.apiBase}/presence?binId=${this.currentBin.id}`, {
                method: 'OPTIONS'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updatePresenceDisplay(data.conversations || {});
            }
        } catch (error) {
            console.error('Failed to poll presence:', error);
        }
    }
    
    updatePresenceDisplay(presenceData) {
        // Update each conversation file element with presence info
        document.querySelectorAll('.conversation-file').forEach(convEl => {
            const convId = convEl.dataset.conversationId;
            const viewerCount = presenceData[convId] || 0;
            
            // Find or create presence indicator
            let presenceEl = convEl.querySelector('.presence-indicator');
            if (!presenceEl && viewerCount > 0) {
                presenceEl = document.createElement('span');
                presenceEl.className = 'presence-indicator';
                const metaEl = convEl.querySelector('.file-meta');
                if (metaEl) {
                    metaEl.appendChild(presenceEl);
                }
            }
            
            if (presenceEl) {
                if (viewerCount > 0) {
                    // Use ASCII person icon ⚇ or ◉ or ☺ or ♟ or just 'o' for simplicity
                    presenceEl.textContent = `◉${viewerCount}`;
                    presenceEl.style.display = 'inline';
                } else {
                    presenceEl.style.display = 'none';
                }
            }
        });
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
    
    // Recovery methods for failed messages
    async retryLastMessage() {
        // Remove any error indicators
        const flow = document.getElementById('conversationFlow');
        const errorIndicators = flow.querySelectorAll('.message-error, .message-recovery');
        errorIndicators.forEach(el => el.remove());
        
        // Get the last user message
        const lastUserMessage = [...this.currentMessages].reverse().find(m => m.role === 'user');
        if (!lastUserMessage) {
            this.showNotification('No message to retry', 'warning');
            return;
        }
        
        // Check if we already have an assistant response after this message
        const lastUserIndex = this.currentMessages.lastIndexOf(lastUserMessage);
        if (lastUserIndex < this.currentMessages.length - 1) {
            this.showNotification('Response already exists', 'info');
            return;
        }
        
        console.log('[TuneForge] Retrying last message:', {
            content: lastUserMessage.content.substring(0, 50) + '...',
            messageIndex: lastUserIndex
        });
        
        // Temporarily remove the message and re-send it
        this.currentMessages.pop();
        const messageContent = lastUserMessage.content;
        
        // Remove the UI element
        const lastMessageBlock = flow.lastElementChild;
        if (lastMessageBlock && lastMessageBlock.querySelector('.user')) {
            lastMessageBlock.remove();
        }
        
        // Re-add to input and send
        document.getElementById('userMessage').value = messageContent;
        await this.sendMessage();
    }
    
    removeLastMessage() {
        const flow = document.getElementById('conversationFlow');
        
        // Remove error indicators
        const errorIndicators = flow.querySelectorAll('.message-error, .message-recovery');
        errorIndicators.forEach(el => el.remove());
        
        // Get the last user message
        const lastUserMessage = [...this.currentMessages].reverse().find(m => m.role === 'user');
        if (!lastUserMessage) {
            this.showNotification('No message to remove', 'warning');
            return;
        }
        
        // Check if we already have an assistant response after this message
        const lastUserIndex = this.currentMessages.lastIndexOf(lastUserMessage);
        if (lastUserIndex < this.currentMessages.length - 1) {
            this.showNotification('Cannot remove - response already exists', 'warning');
            return;
        }
        
        // Remove from messages array
        this.currentMessages.pop();
        
        // Remove from UI
        const lastMessageBlock = flow.lastElementChild;
        if (lastMessageBlock && lastMessageBlock.querySelector('.user')) {
            lastMessageBlock.remove();
        }
        
        // Clear backup
        sessionStorage.removeItem('tuneforge_pending_message');
        
        // Update turn count
        const turnCount = Math.floor(this.currentMessages.length / 2);
        document.getElementById('turnCount').textContent = turnCount;
        
        this.showNotification('Message removed', 'success');
    }
    
    // Check for pending messages on load
    checkPendingMessage() {
        const pendingStr = sessionStorage.getItem('tuneforge_pending_message');
        if (!pendingStr) return;
        
        try {
            const pending = JSON.parse(pendingStr);
            
            // Check if it's for the current conversation
            if (pending.binId === this.currentBin?.id && 
                pending.conversationId === this.currentConversationId) {
                
                // Check if message is recent (within last hour)
                const age = Date.now() - pending.timestamp;
                if (age < 3600000) { // 1 hour
                    console.log('[TuneForge] Found pending message:', {
                        age: Math.round(age / 1000) + 's',
                        content: pending.content.substring(0, 50) + '...'
                    });
                    
                    // Restore to input field
                    const input = document.getElementById('userMessage');
                    if (input && !input.value) {
                        input.value = pending.content;
                        this.showNotification('Restored unsent message', 'info');
                    }
                }
            }
            
            // Clear old pending message
            sessionStorage.removeItem('tuneforge_pending_message');
        } catch (error) {
            console.error('[TuneForge] Error checking pending message:', error);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.tuneforge = new TuneForgeUltimate();
});