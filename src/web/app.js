// TuneForge - Loom Interface with Arrow Key Navigation
class TuneForgeLoom {
    constructor() {
        console.log('Initializing TuneForge...');
        this.socket = io('http://localhost:3001', {
            timeout: 5000,
            forceNew: true
        });
        console.log('Socket.IO initialized, connecting to http://localhost:3001');
        
        // Add immediate connection state debugging
        console.log('Initial socket state:', this.socket.connected);
        console.log('Socket ID:', this.socket.id);
        
        this.currentConversationId = null;
        this.selectedModels = [];
        this.conversationHistory = [];
        this.availableModels = [];
        this.pendingMessage = null; // For auto-initialization flow
        this.currentParams = {
            temperature: 0.7,
            maxTokens: 1000
        };
        
        // Loom state
        this.activeLoom = null;
        this.activeCompletionIndex = 0;
        this.completionLooms = [];
        
        this.initializeEventListeners();
        this.setupSocketHandlers();
        this.initializeSliders();
        this.setupKeyboardNavigation();
        this.loadSavedPrompts();
    }

    initializeEventListeners() {
        // Model selection
        document.getElementById('selectAllModels').addEventListener('click', () => this.selectAllModels());
        
        // Model selection
        document.addEventListener('click', (e) => {
            if (e.target.closest('.model-option')) {
                this.toggleModelSelection(e.target.closest('.model-option'));
            }
        });

        // Conversation controls
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('newConversation').addEventListener('click', () => this.startNewConversation());
        document.getElementById('saveConversation').addEventListener('click', () => this.saveConversation());

        // System prompt controls
        document.getElementById('savePrompt').addEventListener('click', () => this.saveSystemPrompt());
        document.getElementById('savedPrompts').addEventListener('change', (e) => this.loadSystemPrompt(e));

        // Quick actions
        document.getElementById('exportDataset').addEventListener('click', () => this.exportDataset());
        document.getElementById('viewStats').addEventListener('click', () => this.showStatsModal());
        
        // New action buttons
        document.getElementById('regenerateAll').addEventListener('click', () => this.regenerateAllCompletions());
        document.getElementById('quickSave').addEventListener('click', () => this.quickSaveConversation());
        document.getElementById('exportCSV').addEventListener('click', () => this.exportCSV());

        // Modal controls
        this.setupModalHandlers();

        // Parameter updates
        document.getElementById('temperature').addEventListener('input', (e) => {
            this.currentParams.temperature = parseFloat(e.target.value);
            document.getElementById('temperatureValue').textContent = e.target.value;
        });

        document.getElementById('maxTokens').addEventListener('input', (e) => {
            this.currentParams.maxTokens = parseInt(e.target.value);
            document.getElementById('maxTokensValue').textContent = e.target.value;
        });

        // Keyboard shortcuts for input
        document.getElementById('userMessage').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    setupKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            // Global shortcuts that work anywhere
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'n':
                        e.preventDefault();
                        this.startNewConversation();
                        return;
                    case 's':
                        e.preventDefault();
                        if (!document.getElementById('saveConversation').disabled) {
                            this.saveConversation();
                        }
                        return;
                }
            }

            // Only handle navigation when not in an input field
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
                return;
            }

            // ESC key handling
            if (e.key === 'Escape') {
                this.closeAllModals();
                return;
            }

            // Focus on input with '/'
            if (e.key === '/') {
                e.preventDefault();
                document.getElementById('userMessage').focus();
                return;
            }

            // Arrow key navigation for completion loom
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

    navigateCompletion(direction) {
        if (!this.activeLoom || this.activeLoom.responses.length === 0) return;

        const newIndex = this.activeCompletionIndex + direction;
        const maxIndex = this.activeLoom.responses.length - 1;

        if (newIndex < 0) {
            this.activeCompletionIndex = maxIndex; // Loop to end
        } else if (newIndex > maxIndex) {
            this.activeCompletionIndex = 0; // Loop to start
        } else {
            this.activeCompletionIndex = newIndex;
        }

        this.updateCompletionDisplay();
    }

    selectCurrentCompletion() {
        if (!this.activeLoom || this.activeLoom.responses.length === 0) return;

        const selectedResponse = this.activeLoom.responses[this.activeCompletionIndex];
        if (selectedResponse && !selectedResponse.error) {
            this.weaveCompletion(selectedResponse);
        }
    }

    weaveCompletion(response) {
        // Add the selected response to the conversation
        this.conversationHistory.push({
            role: 'assistant',
            content: response.content,
            metadata: {
                model: response.model,
                tokens: response.usage?.total_tokens || response.usage?.input_tokens + response.usage?.output_tokens
            }
        });

        // Update conversation display
        this.updateConversationDisplay();
        
        // Remove the completion loom entirely
        this.removeActiveLoom();
        
        // Clear the active loom
        this.clearActiveLoom();
        
        // Enable save button
        this.enableSaveButton(true);
        
        // Show notification
        this.showNotification(`Woven response from ${response.model}`, 'success');
        
        // Focus on input for next message
        document.getElementById('userMessage').focus();
    }

    removeActiveLoom() {
        if (this.activeLoom) {
            const loomElement = document.querySelector(`[data-loom-id="${this.activeLoom.id}"]`);
            if (loomElement) {
                // Add fade-out animation
                loomElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                loomElement.style.opacity = '0';
                loomElement.style.transform = 'translateY(-10px)';
                
                setTimeout(() => {
                    if (loomElement.parentNode) {
                        loomElement.parentNode.removeChild(loomElement);
                    }
                }, 300);
            }
            
            // Remove from completionLooms array
            this.completionLooms = this.completionLooms.filter(loom => loom.id !== this.activeLoom.id);
        }
    }

    initializeSliders() {
        // Initialize temperature slider display
        const tempSlider = document.getElementById('temperature');
        const tempValue = document.getElementById('temperatureValue');
        tempValue.textContent = tempSlider.value;
        
        tempSlider.addEventListener('input', (e) => {
            tempValue.textContent = e.target.value;
        });

        // Initialize all regenerate modal sliders
        this.initializeRegenerateSliders();
    }

    initializeRegenerateSliders() {
        const sliders = [
            { id: 'newTemperature', valueId: 'newTemperatureValue' },
            { id: 'newTopP', valueId: 'newTopPValue' },
            { id: 'newFrequencyPenalty', valueId: 'newFrequencyPenaltyValue' },
            { id: 'newPresencePenalty', valueId: 'newPresencePenaltyValue' }
        ];

        sliders.forEach(slider => {
            const sliderElement = document.getElementById(slider.id);
            const valueElement = document.getElementById(slider.valueId);
            
            if (sliderElement && valueElement) {
                // Set initial value
                valueElement.textContent = sliderElement.value;
                
                // Update on change
                sliderElement.addEventListener('input', (e) => {
                    valueElement.textContent = e.target.value;
                });
            }
        });
    }

    setupModalHandlers() {
        // Close modals
        document.querySelectorAll('.modal-close').forEach(element => {
            element.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllModals();
            });
        });
        
        document.querySelectorAll('.modal-backdrop').forEach(element => {
            element.addEventListener('click', (e) => {
                if (e.target === element) {
                    this.closeAllModals();
                }
            });
        });

        
        // Regenerate modal
        document.getElementById('applyRegenerate').addEventListener('click', () => this.applyRegenerate());
        document.getElementById('resetToDefaults').addEventListener('click', () => this.resetRegenerateDefaults());


        // Completion actions
        document.addEventListener('click', (e) => {
            if (e.target.closest('.action-btn')) {
                this.handleCompletionAction(e.target.closest('.action-btn'));
            }
        });
    }

    handleCompletionAction(button) {
        const action = button.dataset.action;
        const loomElement = button.closest('.completion-loom');
        const loomId = loomElement.dataset.loomId;
        const loom = this.completionLooms.find(l => l.id === loomId);

        if (!loom) return;

        switch (action) {
            case 'edit':
                this.editResponse(loom, button);
                break;
            case 'regenerate':
                this.regenerateCompletion(loom);
                break;
            case 'regenerate-custom':
                this.showRegenerateModal(loom);
                break;
        }
    }

    editResponse(loom, button) {
        const card = button.closest('.completion-card');
        const responseIndex = parseInt(card.dataset.index);
        const response = loom.responses[responseIndex];
        
        if (!response) return;
        
        const contentDiv = card.querySelector('.completion-content');
        const currentContent = response.content;
        
        // Create textarea for editing
        const textarea = document.createElement('textarea');
        textarea.className = 'edit-textarea';
        textarea.value = currentContent;
        textarea.style.cssText = `
            width: 100%;
            min-height: 200px;
            background: var(--bg-secondary);
            border: 1px solid var(--border-active);
            color: var(--text-primary);
            font-family: var(--font-mono);
            font-size: 0.9rem;
            line-height: 1.4;
            padding: 1rem;
            resize: vertical;
            border-radius: 4px;
        `;
        
        // Create action buttons
        const editActions = document.createElement('div');
        editActions.className = 'edit-actions';
        editActions.style.cssText = `
            display: flex;
            gap: 0.5rem;
            margin-top: 0.5rem;
            justify-content: flex-end;
        `;
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'SAVE';
        saveBtn.className = 'btn-compact btn-success';
        saveBtn.onclick = () => this.saveEditedResponse(loom, responseIndex, textarea.value, card, contentDiv, editActions);
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'CANCEL';
        cancelBtn.className = 'btn-compact btn-secondary';
        cancelBtn.onclick = () => this.cancelEditResponse(card, contentDiv, editActions);
        
        editActions.appendChild(saveBtn);
        editActions.appendChild(cancelBtn);
        
        // Replace content with editor
        contentDiv.style.display = 'none';
        card.appendChild(textarea);
        card.appendChild(editActions);
        
        // Focus and select text
        textarea.focus();
        textarea.select();
    }
    
    saveEditedResponse(loom, responseIndex, newContent, card, contentDiv, editActions) {
        // Update the response content
        loom.responses[responseIndex].content = newContent;
        
        // Update the display
        contentDiv.innerHTML = this.formatMessageContent(newContent);
        
        // Clean up edit interface
        card.querySelector('.edit-textarea').remove();
        editActions.remove();
        contentDiv.style.display = 'block';
        
        this.showNotification('Response updated', 'success');
    }
    
    cancelEditResponse(card, contentDiv, editActions) {
        // Clean up edit interface
        card.querySelector('.edit-textarea').remove();
        editActions.remove();
        contentDiv.style.display = 'block';
    }

    setupSocketHandlers() {
        console.log('Setting up Socket.IO handlers...');
        
        this.socket.on('connect', () => {
            console.log('✅ Socket.IO connected, ID:', this.socket.id);
            this.updateConnectionStatus(true);
            this.loadAvailableModels();
            this.showNotification('Connected to TuneForge', 'success');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('❌ Socket.IO disconnected, reason:', reason);
            this.updateConnectionStatus(false);
            this.showNotification('Connection lost. Attempting to reconnect...', 'warning');
            this.hideLoadingOverlay();
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔄 Socket.IO reconnected after', attemptNumber, 'attempts');
            this.updateConnectionStatus(true);
            this.showNotification('Reconnected to server', 'success');
            this.loadAvailableModels();
        });

        this.socket.on('connect_error', (error) => {
            console.log('❌ Socket.IO connection error:', error);
            console.log('❌ Error message:', error.message);
            console.log('❌ Error type:', error.type);
            this.updateConnectionStatus(false);
            this.showNotification('Connection error: ' + error.message, 'error');
            this.hideLoadingOverlay();
        });

        this.socket.on('reconnect_error', (error) => {
            console.log('❌ Socket.IO reconnection error:', error);
        });

        this.socket.on('reconnect_failed', () => {
            console.log('❌ Socket.IO reconnection failed');
            this.showNotification('Failed to reconnect. Please refresh the page.', 'error');
        });

        this.socket.on('session-started', (data) => {
            this.hideLoadingOverlay(); // Hide any fullscreen loading
            this.hideInlineLoading(); // Hide the auto-initialization loading
            
            if (data.success) {
                this.updateDatasetCount(data.datasetSize);
                this.showNotification('Session initialized', 'success');
                this.enableConversationInterface();
                
                // If there's a pending message from auto-initialization, send it now
                if (this.pendingMessage) {
                    const messageToSend = this.pendingMessage;
                    this.pendingMessage = null; // Clear pending message
                    setTimeout(() => {
                        // Use setTimeout to ensure UI is fully updated
                        this.startConversation(messageToSend);
                    }, 100);
                }
            } else {
                this.showNotification('Failed to start session: ' + data.error, 'error');
                this.pendingMessage = null; // Clear pending message on failure
            }
        });


        this.socket.on('conversation-started', (data) => {
            this.currentConversationId = data.conversationId;
            // Add system prompt to history if not already present
            if (!this.conversationHistory.find(msg => msg.role === 'system')) {
                this.conversationHistory.unshift({ role: 'system', content: data.systemPrompt });
            }
        });

        this.socket.on('responses-generated', (data) => {
            this.hideLoadingOverlay();
            this.hideInlineLoading();
            this.createCompletionLoom(data.responses);
            
            // Update conversation history if provided by server (for continue-conversation)
            if (data.conversation && data.conversation.length > this.conversationHistory.length) {
                this.conversationHistory = data.conversation;
                this.updateConversationDisplay();
            }
        });

        this.socket.on('conversation-saved', (data) => {
            this.hideInlineLoading();
            this.updateDatasetCount(data.datasetSize);
            this.showNotification(`Conversation saved! Dataset: ${data.datasetSize} examples`, 'success');
            this.enableSaveButton(false);
        });

        this.socket.on('stats-updated', (stats) => {
            this.displayStats(stats);
        });

        this.socket.on('regeneration-complete', (data) => {
            this.hideLoadingOverlay();
            this.hideInlineLoading();
            
            // Remove the old loom and create a new one with regenerated responses
            if (this.currentRegenerateLoom) {
                const oldLoomElement = document.querySelector(`[data-loom-id="${this.currentRegenerateLoom.id}"]`);
                if (oldLoomElement) {
                    oldLoomElement.remove();
                }
                
                // Remove from completionLooms array
                this.completionLooms = this.completionLooms.filter(loom => loom.id !== this.currentRegenerateLoom.id);
            }
            
            // Create new loom with regenerated responses
            this.createCompletionLoom(data.responses);
            
            // Show success notification with details
            const validResponses = data.responses.filter(r => !r.error).length;
            const errorResponses = data.responses.filter(r => r.error).length;
            
            let message = `Regenerated ${validResponses} response${validResponses === 1 ? '' : 's'}`;
            if (errorResponses > 0) {
                message += ` (${errorResponses} failed)`;
            }
            
            this.showNotification(message, 'success');
            this.currentRegenerateLoom = null;
        });

        this.socket.on('error', (error) => {
            this.hideLoadingOverlay();
            this.hideInlineLoading();
            console.error('Socket error:', error);
            
            // Provide user-friendly error messages
            let userMessage = 'An error occurred';
            if (error.message) {
                if (error.message.includes('API')) {
                    userMessage = 'API Error: Please check your API keys and try again';
                } else if (error.message.includes('timeout')) {
                    userMessage = 'Request timed out. Please try again';
                } else if (error.message.includes('rate limit')) {
                    userMessage = 'Rate limit exceeded. Please wait a moment';
                } else {
                    userMessage = error.message;
                }
            }
            
            this.showNotification(userMessage, 'error');
        });
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connectionDot');
        const statusText = document.getElementById('connectionStatus');
        
        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'CONNECTED';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'DISCONNECTED';
        }
    }

    async loadAvailableModels() {
        try {
            const response = await fetch('/api/models');
            const models = await response.json();
            this.availableModels = models;
            this.renderModelOptions(models);
            this.updateSelectAllButton();
        } catch (error) {
            this.showNotification('Failed to load models: ' + error.message, 'error');
        }
    }

    renderModelOptions(models, container = 'modelSelection') {
        const modelContainer = document.getElementById(container);
        modelContainer.innerHTML = '';

        models.forEach(model => {
            const div = document.createElement('div');
            div.className = 'model-option';
            div.dataset.modelId = model.id;
            div.innerHTML = `
                <div class="model-info">
                    <div class="model-name">${model.name}</div>
                    <div class="model-provider">${model.provider.toUpperCase()}</div>
                </div>
                <div class="model-status"></div>
            `;
            modelContainer.appendChild(div);
        });
    }

    toggleModelSelection(element) {
        const modelId = element.dataset.modelId;
        
        if (element.classList.contains('selected')) {
            element.classList.remove('selected');
            this.selectedModels = this.selectedModels.filter(id => id !== modelId);
        } else {
            element.classList.add('selected');
            this.selectedModels.push(modelId);
        }

        // Update select all button text
        this.updateSelectAllButton();
    }

    selectAllModels() {
        const allModelOptions = document.querySelectorAll('.model-option');
        const allSelected = this.selectedModels.length === this.availableModels.length;
        
        if (allSelected) {
            // Deselect all
            allModelOptions.forEach(option => {
                option.classList.remove('selected');
            });
            this.selectedModels = [];
        } else {
            // Select all
            allModelOptions.forEach(option => {
                option.classList.add('selected');
            });
            this.selectedModels = this.availableModels.map(model => model.id);
        }
        
        this.updateSelectAllButton();
    }
    
    updateSelectAllButton() {
        const button = document.getElementById('selectAllModels');
        const allSelected = this.selectedModels.length === this.availableModels.length;
        
        if (allSelected) {
            button.textContent = 'DESELECT ALL';
        } else {
            button.textContent = 'SELECT ALL';
        }
    }

    startSession() {
        if (this.selectedModels.length === 0) {
            this.showNotification('Select at least one AI model', 'warning');
            return;
        }

        const config = {
            systemPrompt: document.getElementById('systemPrompt').value,
            temperature: this.currentParams.temperature,
            maxTokens: this.currentParams.maxTokens,
            selectedModels: this.selectedModels
        };

        this.socket.emit('start-session', config);
        this.showLoadingOverlay('Initializing session...');
    }

    enableConversationInterface() {
        document.getElementById('sendMessage').disabled = false;
        document.getElementById('userMessage').disabled = false;
        this.hideLoadingOverlay();
    }

    sendMessage() {
        const userMessage = document.getElementById('userMessage').value.trim();
        if (!userMessage) {
            this.showNotification('Enter a message', 'warning');
            return;
        }

        // Auto-initialize session if not already initialized
        if (!this.isSessionInitialized()) {
            this.autoInitializeAndSend(userMessage);
            return;
        }

        if (this.currentConversationId) {
            // Continue existing conversation
            this.continueConversation(userMessage);
        } else {
            // Start new conversation
            this.startConversation(userMessage);
        }
    }

    isSessionInitialized() {
        // Always auto-initialize now - no manual initialization required
        return this.currentConversationId !== null;
    }

    autoInitializeAndSend(userMessage) {
        // Auto-select models if none selected
        if (this.selectedModels.length === 0) {
            this.autoSelectModels();
        }

        if (this.selectedModels.length === 0) {
            this.showNotification('No AI models available. Please check your API keys.', 'error');
            return;
        }

        // Store the message to send after initialization
        this.pendingMessage = userMessage;

        // Start session with current configuration
        const config = {
            systemPrompt: document.getElementById('systemPrompt').value,
            temperature: this.currentParams.temperature,
            maxTokens: this.currentParams.maxTokens,
            selectedModels: this.selectedModels
        };

        this.socket.emit('start-session', config);
        this.showInlineLoading('Auto-initializing session...');
    }

    autoSelectModels() {
        // Auto-select first available model if none selected
        const firstModel = document.querySelector('.model-option');
        if (firstModel) {
            this.toggleModelSelection(firstModel);
            this.showNotification('Auto-selected first available model', 'info');
        }
    }

    startConversation(userMessage) {
        // Immediately add user message to conversation history and display
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        this.updateConversationDisplay();

        const data = {
            systemPrompt: document.getElementById('systemPrompt').value,
            userPrompt: userMessage,
            selectedModels: this.selectedModels,
            options: {
                temperature: this.currentParams.temperature,
                maxTokens: this.currentParams.maxTokens
            }
        };

        this.socket.emit('start-conversation', data);
        document.getElementById('userMessage').value = '';
        document.getElementById('userMessage').blur(); // Deselect input for arrow keys
        this.clearActiveLoom();
        this.showInlineLoading('Generating responses...');
    }

    continueConversation(userMessage) {
        // Get the last assistant message from conversation history
        const lastAssistantMessage = this.conversationHistory
            .filter(msg => msg.role === 'assistant')
            .pop();

        if (!lastAssistantMessage) {
            this.showNotification('No assistant response to continue from', 'warning');
            return;
        }

        // Immediately add user message to conversation history and display
        this.conversationHistory.push({
            role: 'user',
            content: userMessage
        });
        this.updateConversationDisplay();

        const data = {
            conversationId: this.currentConversationId,
            selectedResponse: {
                content: lastAssistantMessage.content,
                model: lastAssistantMessage.metadata?.model || 'unknown'
            },
            userPrompt: userMessage,
            selectedModels: this.selectedModels,
            options: {
                temperature: this.currentParams.temperature,
                maxTokens: this.currentParams.maxTokens
            }
        };

        this.socket.emit('continue-conversation', data);
        document.getElementById('userMessage').value = '';
        document.getElementById('userMessage').blur(); // Deselect input for arrow keys
        this.clearActiveLoom();
        this.showInlineLoading('Generating responses...');
    }

    createCompletionLoom(responses) {
        const loomId = 'loom_' + Date.now();
        const loom = {
            id: loomId,
            responses: responses.filter(r => !r.error), // Only valid responses
            errors: responses.filter(r => r.error)
        };

        this.completionLooms.push(loom);
        this.activeLoom = loom;
        this.activeCompletionIndex = 0;

        // Create loom HTML
        const loomContainer = document.getElementById('conversationFlow');
        
        // Clear empty state if present
        const emptyState = loomContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const loomElement = document.createElement('div');
        loomElement.className = 'completion-loom';
        loomElement.dataset.loomId = loomId;
        
        loomElement.innerHTML = `
            <div class="completion-header">
                <div class="completion-title">AI RESPONSES</div>
                <div class="completion-nav">
                    <span class="completion-counter">1</span> / ${loom.responses.length}
                    <span style="margin-left: 1rem; font-size: 0.5rem;">← → NAVIGATE | ENTER SELECT</span>
                </div>
            </div>
            <div class="completion-slider">
                <div class="completion-track">
                    ${loom.responses.map((response, index) => this.renderCompletionCard(response, index)).join('')}
                </div>
                <div class="nav-indicators">
                    ${loom.responses.map((_, index) => `<div class="nav-dot ${index === 0 ? 'active' : ''}"></div>`).join('')}
                </div>
            </div>
        `;

        loomContainer.appendChild(loomElement);
        
        // Show errors if any
        if (loom.errors.length > 0) {
            this.showNotification(`${loom.errors.length} model(s) failed to respond`, 'warning');
        }

        // Auto-scroll to the new loom
        loomElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        // Update display
        this.updateCompletionDisplay();
    }

    renderCompletionCard(response, index) {
        const stats = response.usage ? 
            `${response.usage.total_tokens || (response.usage.input_tokens + response.usage.output_tokens)} tokens` : 
            '';

        return `
            <div class="completion-card ${index === 0 ? 'active' : ''}" data-index="${index}">
                <div class="completion-meta">
                    <div class="completion-model">${response.model}</div>
                    <div class="completion-stats">${stats}</div>
                </div>
                <div class="completion-content">${response.content}</div>
                <div class="completion-actions">
                    <button class="action-btn" data-action="edit" title="Edit response">✎</button>
                    <button class="action-btn" data-action="regenerate" title="Regenerate">↻</button>
                    <button class="action-btn" data-action="regenerate-custom" title="Regenerate with options">⚙</button>
                </div>
            </div>
        `;
    }

    updateCompletionDisplay() {
        if (!this.activeLoom) return;

        const loomElement = document.querySelector(`[data-loom-id="${this.activeLoom.id}"]`);
        if (!loomElement) return;

        const track = loomElement.querySelector('.completion-track');
        const cards = loomElement.querySelectorAll('.completion-card');
        const dots = loomElement.querySelectorAll('.nav-dot');
        const counter = loomElement.querySelector('.completion-counter');

        // Update track position
        const translateX = -this.activeCompletionIndex * 100;
        track.style.transform = `translateX(${translateX}%)`;

        // Update active states
        cards.forEach((card, index) => {
            card.classList.toggle('active', index === this.activeCompletionIndex);
        });

        dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.activeCompletionIndex);
        });

        // Update counter
        counter.textContent = this.activeCompletionIndex + 1;
    }

    clearActiveLoom() {
        this.activeLoom = null;
        this.activeCompletionIndex = 0;
    }

    updateConversationDisplay() {
        const container = document.getElementById('conversationFlow');
        
        // Clear empty state if present
        const emptyState = container.querySelector('.empty-state');
        if (emptyState) {
            emptyState.style.transition = 'opacity 0.3s ease';
            emptyState.style.opacity = '0';
            setTimeout(() => emptyState.remove(), 300);
        }

        // Clear existing messages but keep completion looms
        const existingMessages = container.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());

        // Add conversation messages in proper order
        this.conversationHistory.forEach((message, index) => {
            if (message.role === 'system') return; // Skip system messages in display

            const div = document.createElement('div');
            div.className = `message ${message.role}`;
            div.dataset.messageIndex = index;
            div.innerHTML = `
                <div class="message-role">${message.role.toUpperCase()}</div>
                <div class="message-content">${this.formatMessageContent(message.content)}</div>
            `;

            // Add click-to-copy functionality
            div.addEventListener('click', () => this.copyMessageToClipboard(message.content));
            div.title = 'Click to copy message';

            // Find the correct position to insert this message
            this.insertMessageInOrder(container, div, index);
        });

        // Auto-scroll to bottom with smooth animation
        this.smoothScrollToBottom(container);
    }

    copyMessageToClipboard(content) {
        navigator.clipboard.writeText(content).then(() => {
            this.showNotification('Message copied to clipboard', 'success');
        }).catch(() => {
            this.showNotification('Failed to copy message', 'error');
        });
    }

    smoothScrollToBottom(container) {
        setTimeout(() => {
            const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 1;
            if (!isScrolledToBottom) {
                container.scrollTo({
                    top: container.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }, 100);
    }

    insertMessageInOrder(container, messageDiv, messageIndex) {
        const messageIndexNum = parseInt(messageIndex);
        const existingMessages = container.querySelectorAll('.message');
        let inserted = false;

        // Find where to insert based on message index
        for (let i = 0; i < existingMessages.length; i++) {
            const existingIndex = parseInt(existingMessages[i].dataset.messageIndex);
            if (messageIndexNum < existingIndex) {
                container.insertBefore(messageDiv, existingMessages[i]);
                inserted = true;
                break;
            }
        }

        // If not inserted yet, check completion looms
        if (!inserted) {
            const looms = container.querySelectorAll('.completion-loom');
            if (looms.length > 0) {
                // Insert before the first loom
                container.insertBefore(messageDiv, looms[0]);
            } else {
                // Append to end
                container.appendChild(messageDiv);
            }
        }
    }

    formatMessageContent(content) {
        // Format content for display (preserving whitespace, adding basic formatting)
        return content
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(.*)$/, '<p>$1</p>')
            .replace(/<p><\/p>/g, '');
    }

    startNewConversation() {
        this.currentConversationId = null;
        this.conversationHistory = [];
        this.completionLooms = [];
        this.clearActiveLoom();
        this.enableSaveButton(false);
        
        const container = document.getElementById('conversationFlow');
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚡</div>
                <h3>INITIATE CONVERSATION</h3>
                <p>Configure your AI models and start weaving responses into the perfect conversation thread</p>
            </div>
        `;
        
        document.getElementById('userMessage').value = '';
        this.showNotification('Ready for new conversation', 'success');
    }

    saveConversation() {
        if (this.conversationHistory.filter(m => m.role === 'assistant').length === 0) {
            this.showNotification('No assistant responses to save', 'warning');
            return;
        }

        // Get the last assistant message
        const lastAssistantMessage = this.conversationHistory
            .filter(msg => msg.role === 'assistant')
            .pop();

        const data = {
            conversationId: this.currentConversationId,
            selectedResponse: {
                content: lastAssistantMessage.content,
                model: lastAssistantMessage.metadata?.model || 'unknown'
            },
            metadata: {
                temperature: this.currentParams.temperature,
                maxTokens: this.currentParams.maxTokens,
                modelCount: this.selectedModels.length,
                turnCount: this.conversationHistory.filter(m => m.role === 'user').length
            }
        };

        this.socket.emit('save-conversation', data);
        this.showInlineLoading('Saving conversation...');
    }

    regenerateCompletion(loom) {
        // Store reference to current loom
        this.currentRegenerateLoom = loom;
        
        // Show simple loading for same-parameters regeneration
        this.showLoadingOverlay('Regenerating with current parameters...');

        // Get the current conversation context
        const lastUserMessage = this.conversationHistory
            .filter(msg => msg.role === 'user')
            .pop();

        if (!lastUserMessage) {
            this.hideLoadingOverlay();
            this.showNotification('No user message found for regeneration', 'error');
            return;
        }

        // Use current parameters for regeneration
        const data = {
            conversationId: this.currentConversationId,
            userPrompt: lastUserMessage.content,
            selectedModels: this.selectedModels,
            options: {
                temperature: this.currentParams.temperature,
                maxTokens: this.currentParams.maxTokens,
                topP: 1.0,
                frequencyPenalty: 0,
                presencePenalty: 0,
                seed: null,
                systemPromptOverride: null,
                responseCount: 1,
                usePersonaVariations: false
            },
            conversation: this.conversationHistory
        };

        this.socket.emit('regenerate-responses', data);
    }

    showRegenerateModal(loom) {
        // Store reference to current loom
        this.currentRegenerateLoom = loom;
        
        // Populate modal with current settings
        document.getElementById('newTemperature').value = this.currentParams.temperature;
        document.getElementById('newTemperatureValue').textContent = this.currentParams.temperature;
        document.getElementById('newMaxTokens').value = this.currentParams.maxTokens;
        
        // Set advanced parameters to defaults
        document.getElementById('newTopP').value = 1.0;
        document.getElementById('newTopPValue').textContent = '1.0';
        document.getElementById('newFrequencyPenalty').value = 0;
        document.getElementById('newFrequencyPenaltyValue').textContent = '0.0';
        document.getElementById('newPresencePenalty').value = 0;
        document.getElementById('newPresencePenaltyValue').textContent = '0.0';
        document.getElementById('newSeed').value = '';
        
        // Clear system prompt override
        document.getElementById('newSystemPrompt').value = '';
        
        // Reset response options
        document.getElementById('responseCount').value = '1';
        document.getElementById('usePersonaVariations').checked = false;

        // Render model selection
        this.renderModelOptions(this.availableModels, 'regenerateModelSelection');
        
        // Pre-select current models
        this.selectedModels.forEach(modelId => {
            const modelOption = document.querySelector(`#regenerateModelSelection .model-option[data-model-id="${modelId}"]`);
            if (modelOption) {
                modelOption.classList.add('selected');
            }
        });

        document.getElementById('regenerateModal').classList.add('active');
    }

    resetRegenerateDefaults() {
        // Reset all parameters to defaults
        document.getElementById('newTemperature').value = 0.7;
        document.getElementById('newTemperatureValue').textContent = '0.7';
        document.getElementById('newMaxTokens').value = 1000;
        document.getElementById('newTopP').value = 1.0;
        document.getElementById('newTopPValue').textContent = '1.0';
        document.getElementById('newFrequencyPenalty').value = 0;
        document.getElementById('newFrequencyPenaltyValue').textContent = '0.0';
        document.getElementById('newPresencePenalty').value = 0;
        document.getElementById('newPresencePenaltyValue').textContent = '0.0';
        document.getElementById('newSeed').value = '';
        document.getElementById('newSystemPrompt').value = '';
        document.getElementById('responseCount').value = '1';
        document.getElementById('usePersonaVariations').checked = false;
        
        this.showNotification('Reset to default parameters', 'info');
    }

    applyRegenerate() {
        if (!this.currentRegenerateLoom) {
            this.showNotification('No active completion to regenerate', 'error');
            return;
        }

        // Collect all the new parameters
        const newParams = {
            temperature: parseFloat(document.getElementById('newTemperature').value),
            maxTokens: parseInt(document.getElementById('newMaxTokens').value),
            topP: parseFloat(document.getElementById('newTopP').value),
            frequencyPenalty: parseFloat(document.getElementById('newFrequencyPenalty').value),
            presencePenalty: parseFloat(document.getElementById('newPresencePenalty').value),
            seed: document.getElementById('newSeed').value || null,
            systemPromptOverride: document.getElementById('newSystemPrompt').value.trim() || null,
            responseCount: parseInt(document.getElementById('responseCount').value),
            usePersonaVariations: document.getElementById('usePersonaVariations').checked
        };

        // Get selected models
        const selectedModels = Array.from(document.querySelectorAll('#regenerateModelSelection .model-option.selected'))
            .map(option => option.dataset.modelId);

        if (selectedModels.length === 0) {
            this.showNotification('Select at least one model for regeneration', 'warning');
            return;
        }

        // Close modal and show prominent loading
        this.closeAllModals();
        this.showRegenerationLoading(newParams, selectedModels.length);

        // Get the current conversation context
        const lastUserMessage = this.conversationHistory
            .filter(msg => msg.role === 'user')
            .pop();

        if (!lastUserMessage) {
            this.hideLoadingOverlay();
            this.showNotification('No user message found for regeneration', 'error');
            return;
        }

        // Emit regeneration request
        const data = {
            conversationId: this.currentConversationId,
            userPrompt: lastUserMessage.content,
            selectedModels: selectedModels,
            options: newParams,
            conversation: this.conversationHistory
        };

        this.socket.emit('regenerate-responses', data);
    }

    showInlineRegenerationLoading(params, modelCount) {
        // Create a detailed inline loading state
        const loadingHTML = `
            <div class="inline-loading-state regeneration-loading">
                <div class="loading-header">
                    <div class="loading-icon">🔄</div>
                    <h3>REGENERATING RESPONSES</h3>
                </div>
                
                <div class="loading-details">
                    <div class="loading-row">
                        <span>Models:</span>
                        <span class="loading-value">${modelCount}</span>
                    </div>
                    <div class="loading-row">
                        <span>Temperature:</span>
                        <span class="loading-value">${params.temperature}</span>
                    </div>
                    <div class="loading-row">
                        <span>Max Tokens:</span>
                        <span class="loading-value">${params.maxTokens}</span>
                    </div>
                    ${params.topP !== 1.0 ? `<div class="loading-row"><span>Top P:</span><span class="loading-value">${params.topP}</span></div>` : ''}
                    ${params.frequencyPenalty !== 0 ? `<div class="loading-row"><span>Frequency Penalty:</span><span class="loading-value">${params.frequencyPenalty}</span></div>` : ''}
                    ${params.presencePenalty !== 0 ? `<div class="loading-row"><span>Presence Penalty:</span><span class="loading-value">${params.presencePenalty}</span></div>` : ''}
                    ${params.seed ? `<div class="loading-row"><span>Seed:</span><span class="loading-value">${params.seed}</span></div>` : ''}
                </div>
                
                <div class="loading-progress">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-text">Generating responses with custom parameters...</div>
                </div>
                
                <div class="loading-spinner"></div>
            </div>
        `;

        // Insert loading state into conversation flow
        const conversationFlow = document.getElementById('conversationFlow');
        const loadingElement = document.createElement('div');
        loadingElement.className = 'loading-loom';
        loadingElement.innerHTML = loadingHTML;
        conversationFlow.appendChild(loadingElement);
        
        // Scroll to show loading
        loadingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Start progress animation
        this.startProgressAnimation();
    }

    startProgressAnimation() {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        
        if (!progressFill || !progressText) return;

        let progress = 0;
        const steps = [
            'Initializing regeneration...',
            'Applying custom parameters...',
            'Querying AI models...',
            'Processing responses...',
            'Finalizing results...'
        ];
        
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15 + 5; // Random progress increments
            
            if (progress > 100) progress = 100;
            
            progressFill.style.width = `${progress}%`;
            
            const stepIndex = Math.floor((progress / 100) * steps.length);
            if (stepIndex < steps.length) {
                progressText.textContent = steps[stepIndex];
            }
            
            if (progress >= 100) {
                clearInterval(progressInterval);
                progressText.textContent = 'Completing regeneration...';
            }
        }, 300);

        // Store interval to clear it when loading finishes
        this.progressInterval = progressInterval;
    }
    
    showInlineLoading(text = 'PROCESSING...') {
        const loadingHTML = `
            <div class="inline-loading-state simple-loading">
                <div class="loading-text">${text}</div>
                <div class="loading-dots">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                </div>
            </div>
        `;
        
        // Insert loading state into conversation flow
        const conversationFlow = document.getElementById('conversationFlow');
        const loadingElement = document.createElement('div');
        loadingElement.className = 'loading-loom';
        loadingElement.innerHTML = loadingHTML;
        conversationFlow.appendChild(loadingElement);
        
        // Scroll to show loading
        loadingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    hideInlineLoading() {
        // Remove all loading states from conversation flow
        document.querySelectorAll('.loading-loom').forEach(el => el.remove());
        
        // Clear progress animation if it exists
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    // Stats modal
    showStatsModal() {
        this.socket.emit('get-stats');
        document.getElementById('statsModal').classList.add('active');
    }

    displayStats(stats) {
        const container = document.getElementById('statsContent');
        
        const modelStats = Object.entries(stats.models).map(([model, count]) => 
            `<div class="stat-item"><span>${model}:</span><span class="stat-value">${count}</span></div>`
        ).join('');


        container.innerHTML = `
            <div class="stats-section">
                <h4>DATASET OVERVIEW</h4>
                <div class="stat-item">
                    <span>Total Examples:</span>
                    <span class="stat-value">${stats.total}</span>
                </div>
                <div class="stat-item">
                    <span>Average Tokens:</span>
                    <span class="stat-value">${stats.avgTokens}</span>
                </div>
            </div>
            
            <div class="stats-section">
                <h4>MODEL DISTRIBUTION</h4>
                ${modelStats || '<p>No model data available</p>'}
            </div>
            
        `;
    }

    // Utility methods
    clearInput() {
        document.getElementById('userMessage').value = '';
        document.getElementById('userMessage').focus();
    }

    exportDataset() {
        window.open('/api/export', '_blank');
        this.showNotification('Dataset export started', 'success');
    }

    exportCSV() {
        window.open('/api/export?format=csv', '_blank');
        this.showNotification('CSV export started', 'success');
    }

    regenerateAllCompletions() {
        if (!this.activeLoom || this.activeLoom.responses.length === 0) {
            this.showNotification('No active completions to regenerate', 'warning');
            return;
        }
        
        // Use the simple regeneration method for all
        this.regenerateCompletion(this.activeLoom);
    }

    quickSaveConversation() {
        if (this.conversationHistory.filter(m => m.role === 'assistant').length === 0) {
            this.showNotification('No conversation to save', 'warning');
            return;
        }
        
        // Automatically save without confirmation
        this.saveConversation();
    }

    updateDatasetCount(count) {
        document.getElementById('datasetCount').textContent = count;
    }

    enableSaveButton(enabled) {
        const saveButton = document.getElementById('saveConversation');
        saveButton.disabled = !enabled;
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    showLoadingOverlay(text = 'PROCESSING...') {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoadingOverlay() {
        // Clear progress animation if it exists
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        document.getElementById('loadingOverlay').style.display = 'none';
        
        // Reset loading content to default
        document.getElementById('loadingOverlay').innerHTML = `
            <div class="loading-content">
                <div class="loading-spinner"></div>
                <p id="loadingText">PROCESSING...</p>
            </div>
        `;
        
        // Also hide inline loading
        this.hideInlineLoading();
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'i'
        };

        notification.innerHTML = `
            <div class="notification-icon">${icons[type] || icons.info}</div>
            <div class="notification-message">${message}</div>
        `;

        document.getElementById('notifications').appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    // System prompt saving functionality
    saveSystemPrompt() {
        const systemPrompt = document.getElementById('systemPrompt').value.trim();
        if (!systemPrompt) {
            this.showNotification('System prompt cannot be empty', 'error');
            return;
        }

        const name = prompt('Enter a name for this system prompt:');
        if (!name) return;

        let savedPrompts = this.getSavedPrompts();
        savedPrompts[name] = systemPrompt;
        
        localStorage.setItem('tuneforge_system_prompts', JSON.stringify(savedPrompts));
        this.loadSavedPrompts();
        this.showNotification(`System prompt "${name}" saved`, 'success');
    }

    loadSystemPrompt(event) {
        const promptName = event.target.value;
        if (!promptName) return;

        if (promptName === '__delete__') {
            this.deleteSystemPrompt();
            event.target.value = '';
            return;
        }

        const savedPrompts = this.getSavedPrompts();
        if (savedPrompts[promptName]) {
            document.getElementById('systemPrompt').value = savedPrompts[promptName];
            this.showNotification(`System prompt "${promptName}" loaded`, 'success');
        }
        
        // Reset dropdown to default
        event.target.value = '';
    }

    deleteSystemPrompt() {
        const savedPrompts = this.getSavedPrompts();
        const promptNames = Object.keys(savedPrompts);
        
        if (promptNames.length === 0) {
            this.showNotification('No saved prompts to delete', 'info');
            return;
        }

        const nameToDelete = prompt(`Enter the name of the prompt to delete:\n\nAvailable prompts:\n${promptNames.join('\n')}`);
        if (!nameToDelete || !savedPrompts[nameToDelete]) {
            this.showNotification('Invalid prompt name', 'error');
            return;
        }

        delete savedPrompts[nameToDelete];
        localStorage.setItem('tuneforge_system_prompts', JSON.stringify(savedPrompts));
        this.loadSavedPrompts();
        this.showNotification(`System prompt "${nameToDelete}" deleted`, 'success');
    }

    getSavedPrompts() {
        try {
            const saved = localStorage.getItem('tuneforge_system_prompts');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.warn('Failed to load saved prompts:', error);
            return {};
        }
    }

    loadSavedPrompts() {
        const dropdown = document.getElementById('savedPrompts');
        const savedPrompts = this.getSavedPrompts();
        
        // Clear existing options except the first one
        dropdown.innerHTML = '<option value="">Load Saved...</option>';
        
        // Add saved prompts
        Object.keys(savedPrompts).forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            dropdown.appendChild(option);
        });
        
        // Add delete option if there are saved prompts
        if (Object.keys(savedPrompts).length > 0) {
            const deleteOption = document.createElement('option');
            deleteOption.value = '__delete__';
            deleteOption.textContent = '--- Delete Saved ---';
            dropdown.appendChild(deleteOption);
        }
    }
}

// Initialize the loom interface when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const loom = new TuneForgeLoom();
    
    // Token counter event handler
    document.addEventListener('click', (e) => {
        if (e.target.closest('.token-btn')) {
            const button = e.target.closest('.token-btn');
            const action = button.dataset.action;
            const tokenInput = document.getElementById('maxTokens');
            const tokenDisplay = document.getElementById('maxTokensValue');
            const currentValue = parseInt(tokenInput.value);
            
            let newValue = currentValue;
            
            if (action === 'decrease') {
                newValue = Math.max(1, currentValue - 100);
            } else if (action === 'increase') {
                newValue = Math.min(8000, currentValue + 100);
            }
            
            if (newValue !== currentValue) {
                tokenInput.value = newValue;
                tokenDisplay.textContent = newValue;
                loom.currentParams.maxTokens = newValue;
            }
        }
        
        // Token display click-to-edit handler
        if (e.target.id === 'maxTokensValue') {
            const tokenDisplay = e.target;
            const tokenInput = document.getElementById('maxTokens');
            const currentValue = tokenDisplay.textContent;
            
            // Create an input element to replace the display
            const editInput = document.createElement('input');
            editInput.type = 'number';
            editInput.min = '1';
            editInput.max = '8000';
            editInput.value = currentValue;
            editInput.className = 'token-edit-input';
            editInput.style.cssText = `
                background: var(--bg-primary);
                border: 1px solid var(--matrix-green);
                color: var(--matrix-green);
                font-family: var(--font-mono);
                font-size: inherit;
                text-align: center;
                width: 60px;
                padding: 2px;
                border-radius: 2px;
            `;
            
            // Replace display with input
            tokenDisplay.style.display = 'none';
            tokenDisplay.parentNode.insertBefore(editInput, tokenDisplay);
            editInput.focus();
            editInput.select();
            
            const saveEdit = () => {
                const newValue = Math.min(8000, Math.max(1, parseInt(editInput.value) || 1));
                tokenInput.value = newValue;
                tokenDisplay.textContent = newValue;
                loom.currentParams.maxTokens = newValue;
                
                // Restore display
                editInput.remove();
                tokenDisplay.style.display = '';
            };
            
            const cancelEdit = () => {
                // Restore display without saving
                editInput.remove();
                tokenDisplay.style.display = '';
            };
            
            // Handle save/cancel
            editInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveEdit();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelEdit();
                }
            });
            
            editInput.addEventListener('blur', saveEdit);
        }
    });
});

// Add some terminal-style effects
document.addEventListener('DOMContentLoaded', () => {
    // Add glitch effect to logo occasionally
    setInterval(() => {
        const logo = document.querySelector('.logo-text');
        if (logo && Math.random() < 0.1) { // 10% chance
            logo.style.textShadow = '2px 0 #ff0000, -2px 0 #00ff00';
            setTimeout(() => {
                logo.style.textShadow = '0 0 10px var(--matrix-green-glow)';
            }, 150);
        }
    }, 5000);

    // Add typing animation to empty state
    const addTypingAnimation = () => {
        const emptyState = document.querySelector('.empty-state h3');
        if (emptyState && emptyState.textContent === 'INITIATE CONVERSATION') {
            let text = 'INITIATE CONVERSATION';
            emptyState.textContent = '';
            let i = 0;
            
            const typeWriter = () => {
                if (i < text.length) {
                    emptyState.textContent += text.charAt(i);
                    i++;
                    setTimeout(typeWriter, 80);
                }
            };
            
            setTimeout(typeWriter, 500);
        }
    };

    addTypingAnimation();
});