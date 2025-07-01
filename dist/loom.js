// Loom - Conversation Multiverse Navigator
class ConversationLoom {
    constructor(app) {
        this.app = app;
        this.modal = document.getElementById('loomModal');
        this.canvas = document.getElementById('loomCanvas');
        
        // State
        this.nodes = new Map();
        this.connections = [];
        this.currentNodeId = null;
        this.selectedNodeId = null;
        this.branches = [];
        this.viewMode = 'tree'; // tree, graph, timeline
        
        // Tree layout config
        this.nodeWidth = 200;
        this.nodeHeight = 80;
        this.horizontalSpacing = 250;
        this.verticalSpacing = 120;
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // Open/close modal
        document.getElementById('openLoom').addEventListener('click', () => this.open());
        this.modal.querySelector('.modal-close').addEventListener('click', () => this.close());
        this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
        
        // Action buttons
        document.getElementById('loomReset').addEventListener('click', () => this.reset());
        document.getElementById('loomUndo').addEventListener('click', () => this.undo());
        document.getElementById('loomBranch').addEventListener('click', () => this.createBranch());
        document.getElementById('loomMerge').addEventListener('click', () => this.mergeBranch());
        document.getElementById('loomFilter').addEventListener('click', () => this.showFilter());
        
        // View controls
        document.getElementById('viewTree').addEventListener('click', () => this.setView('tree'));
        document.getElementById('viewGraph').addEventListener('click', () => this.setView('graph'));
        document.getElementById('viewTimeline').addEventListener('click', () => this.setView('timeline'));
        
        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.close();
            }
        });
    }
    
    // Add loom icons to messages
    addLoomIcons() {
        // Add to regular messages
        document.querySelectorAll('.message').forEach((messageEl, index) => {
            if (!messageEl.querySelector('.message-loom-icon')) {
                const loomIcon = document.createElement('button');
                loomIcon.className = 'message-loom-icon';
                loomIcon.innerHTML = '◈';
                loomIcon.title = 'Open loom at this point';
                loomIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openAtMessage(index);
                });
                messageEl.appendChild(loomIcon);
            }
        });
        
        // Add to completion cards
        document.querySelectorAll('.completion-card').forEach((cardEl, index) => {
            const actionsEl = cardEl.querySelector('.completion-actions');
            if (actionsEl && !actionsEl.querySelector('.loom-btn')) {
                const loomBtn = document.createElement('button');
                loomBtn.className = 'action-btn loom-btn';
                loomBtn.innerHTML = '◈';
                loomBtn.title = 'Open loom for this completion';
                loomBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openAtCompletion(index);
                });
                actionsEl.appendChild(loomBtn);
            }
        });
    }
    
    async openAtMessage(messageIndex) {
        this.targetMessageIndex = messageIndex;
        await this.open();
        
        // Highlight the specific message point in the loom
        this.app.showNotification(`Loom opened at message ${messageIndex + 1}`, 'info');
    }
    
    async openAtCompletion(completionIndex) {
        this.targetCompletionIndex = completionIndex;
        await this.open();
        
        // Focus on the current position
        this.app.showNotification(`Loom opened for completion variant`, 'info');
    }
    
    async open() {
        this.modal.classList.add('active');
        this.updateStatus('LOADING');
        
        try {
            // Load conversation branches
            await this.loadConversationData();
            this.render();
            this.updateStatus('READY');
        } catch (error) {
            console.error('Failed to load loom data:', error);
            this.updateStatus('ERROR');
            this.app.showNotification('Failed to load conversation data', 'error');
        }
    }
    
    close() {
        this.modal.classList.remove('active');
    }
    
    async loadConversationData() {
        if (!this.app.currentConversationId || !this.app.currentBin) {
            throw new Error('No active conversation');
        }
        
        // Load branches from API - use the app's authenticated fetch method
        const response = await this.app.fetchWithAuth(`${this.app.apiBase}/branches?conversationId=${this.app.currentConversationId}&binId=${this.app.currentBin.id}`);
        if (!response.ok) throw new Error('Failed to load branches');
        
        const data = await response.json();
        
        // Clear existing data
        this.nodes.clear();
        this.connections = [];
        this.branches = data.branches || [];
        
        // Create main timeline node
        const mainNode = {
            id: 'main',
            type: 'main',
            messages: this.app.currentMessages,
            depth: 0,
            x: 0,
            y: 0
        };
        this.nodes.set('main', mainNode);
        this.currentNodeId = 'main';
        
        // Create branch nodes
        this.branches.forEach((branch, index) => {
            const branchNode = {
                id: branch.id,
                type: 'branch',
                messages: branch.messages,
                branchPoint: branch.branchPoint,
                metadata: branch.metadata,
                depth: 1,
                x: (index + 1) * this.horizontalSpacing,
                y: this.verticalSpacing
            };
            this.nodes.set(branch.id, branchNode);
            
            // Create connection
            this.connections.push({
                from: 'main',
                to: branch.id,
                branchPoint: branch.branchPoint
            });
        });
        
        // Update stats
        this.updateStats();
    }
    
    render() {
        this.canvas.innerHTML = '';
        
        switch (this.viewMode) {
            case 'tree':
                this.renderTreeView();
                break;
            case 'graph':
                this.renderGraphView();
                break;
            case 'timeline':
                this.renderTimelineView();
                break;
        }
    }
    
    renderTreeView() {
        // Add loading animation
        const loading = document.createElement('div');
        loading.className = 'loom-loading';
        loading.innerHTML = `
            <div class="loom-loading-text">MAPPING MULTIVERSE...</div>
            <div class="loom-loading-bar">
                <div class="loom-loading-progress"></div>
            </div>
        `;
        this.canvas.appendChild(loading);
        
        // Render after animation
        setTimeout(() => {
            this.canvas.innerHTML = '';
            
            // Calculate canvas size
            let maxX = 0, maxY = 0;
            this.nodes.forEach(node => {
                maxX = Math.max(maxX, node.x + this.nodeWidth);
                maxY = Math.max(maxY, node.y + this.nodeHeight);
            });
            
            // Set canvas size
            this.canvas.style.width = `${maxX + 100}px`;
            this.canvas.style.height = `${maxY + 100}px`;
            
            // Render connections
            this.connections.forEach(conn => {
                this.renderConnection(conn);
            });
            
            // Render nodes
            this.nodes.forEach(node => {
                this.renderNode(node);
            });
        }, 500);
    }
    
    renderNode(node) {
        const nodeEl = document.createElement('div');
        nodeEl.className = `loom-node ${node.type}`;
        nodeEl.id = `node-${node.id}`;
        nodeEl.style.left = `${node.x}px`;
        nodeEl.style.top = `${node.y}px`;
        
        if (node.id === this.currentNodeId) {
            nodeEl.classList.add('active');
        }
        
        // Get message preview
        const lastMessage = node.messages[node.messages.length - 1];
        const preview = lastMessage ? 
            lastMessage.content.substring(0, 100) + '...' : 
            'Empty conversation';
        
        nodeEl.innerHTML = `
            <div class="node-header">
                <span class="node-type">${node.type.toUpperCase()}</span>
                <span class="node-id">${node.id.substring(0, 8)}</span>
            </div>
            <div class="node-content">${this.escapeHtml(preview)}</div>
        `;
        
        nodeEl.addEventListener('click', () => this.selectNode(node.id));
        
        this.canvas.appendChild(nodeEl);
    }
    
    renderConnection(conn) {
        const fromNode = this.nodes.get(conn.from);
        const toNode = this.nodes.get(conn.to);
        
        if (!fromNode || !toNode) return;
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.pointerEvents = 'none';
        
        // Calculate path
        const x1 = fromNode.x + this.nodeWidth / 2;
        const y1 = fromNode.y + this.nodeHeight;
        const x2 = toNode.x + this.nodeWidth / 2;
        const y2 = toNode.y;
        
        // Set SVG size and position
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const width = Math.abs(x2 - x1) + 10;
        const height = Math.abs(y2 - y1) + 10;
        
        svg.style.left = `${minX - 5}px`;
        svg.style.top = `${minY - 5}px`;
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        
        // Create path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const relX1 = x1 - minX + 5;
        const relY1 = y1 - minY + 5;
        const relX2 = x2 - minX + 5;
        const relY2 = y2 - minY + 5;
        
        // Bezier curve
        const controlY = (relY1 + relY2) / 2;
        path.setAttribute('d', `M ${relX1} ${relY1} C ${relX1} ${controlY}, ${relX2} ${controlY}, ${relX2} ${relY2}`);
        
        svg.appendChild(path);
        
        const connEl = document.createElement('div');
        connEl.className = 'loom-connection';
        if (conn.from === this.currentNodeId || conn.to === this.currentNodeId) {
            connEl.classList.add('active');
        }
        connEl.appendChild(svg);
        
        this.canvas.appendChild(connEl);
    }
    
    renderGraphView() {
        // Placeholder for graph view
        this.canvas.innerHTML = `
            <div class="graph-container">
                <div class="loom-loading">
                    <div class="loom-loading-text">GRAPH VIEW COMING SOON...</div>
                </div>
            </div>
        `;
    }
    
    renderTimelineView() {
        this.canvas.innerHTML = '';
        
        const container = document.createElement('div');
        container.className = 'timeline-container';
        
        // Create timeline for main conversation
        const mainTrack = document.createElement('div');
        mainTrack.className = 'timeline-track';
        
        const mainLine = document.createElement('div');
        mainLine.className = 'timeline-line';
        mainTrack.appendChild(mainLine);
        
        // Add nodes for each message
        const mainNode = this.nodes.get('main');
        mainNode.messages.forEach((msg, index) => {
            const node = document.createElement('div');
            node.className = 'timeline-node';
            
            // Check if this is a branch point
            const isBranchPoint = this.branches.some(b => b.branchPoint === index);
            if (isBranchPoint) {
                node.classList.add('branch-point');
            }
            
            node.style.left = `${index * 100}px`;
            node.title = `Message ${index + 1}: ${msg.role}`;
            
            node.addEventListener('click', () => {
                this.app.showNotification(`Message ${index + 1}: ${msg.role}`, 'info');
            });
            
            mainTrack.appendChild(node);
        });
        
        container.appendChild(mainTrack);
        
        // Add branch timelines
        this.branches.forEach(branch => {
            const branchTrack = document.createElement('div');
            branchTrack.className = 'timeline-track';
            
            const branchLine = document.createElement('div');
            branchLine.className = 'timeline-line';
            branchLine.style.left = `${branch.branchPoint * 100}px`;
            branchTrack.appendChild(branchLine);
            
            // Add branch nodes
            branch.messages.forEach((msg, index) => {
                const node = document.createElement('div');
                node.className = 'timeline-node';
                node.style.left = `${(branch.branchPoint + index) * 100}px`;
                node.title = `Branch ${branch.id.substring(0, 8)} - Message ${index + 1}`;
                
                branchTrack.appendChild(node);
            });
            
            container.appendChild(branchTrack);
        });
        
        this.canvas.appendChild(container);
    }
    
    selectNode(nodeId) {
        this.selectedNodeId = nodeId;
        
        // Update UI
        document.querySelectorAll('.loom-node').forEach(el => {
            el.classList.toggle('active', el.id === `node-${nodeId}`);
        });
        
        // Update selected node display
        document.getElementById('selectedNode').textContent = nodeId.substring(0, 8);
        
        // Update thread list
        this.updateThreadList();
        
        // Add ability to load branch into main view on double-click
        const node = this.nodes.get(nodeId);
        if (node && this.lastClickedNode === nodeId && Date.now() - this.lastClickTime < 500) {
            // Double click detected - load this branch
            this.loadBranchIntoView(nodeId);
        }
        this.lastClickedNode = nodeId;
        this.lastClickTime = Date.now();
    }
    
    async loadBranchIntoView(nodeId) {
        if (nodeId === 'main') {
            // Already viewing main
            return;
        }
        
        const branch = this.branches.find(b => b.id === nodeId);
        if (!branch) return;
        
        if (confirm(`Load branch ${nodeId.substring(0, 8)} into the main conversation view? This will replace the current conversation display.`)) {
            // Update the conversation display with branch messages
            this.app.currentMessages = [...branch.messages];
            await this.app.renderConversation();
            
            // Update UI to show we're viewing a branch
            document.getElementById('conversationName').textContent = 
                `${this.app.currentConversationName} [BRANCH: ${nodeId.substring(0, 8)}]`;
            
            this.app.showNotification(`Viewing branch ${nodeId.substring(0, 8)}`, 'info');
            
            // Close loom to focus on the branch
            this.close();
        }
    }
    
    async createBranch() {
        if (!this.selectedNodeId) {
            this.app.showNotification('Select a node to branch from', 'warning');
            return;
        }
        
        const node = this.nodes.get(this.selectedNodeId);
        if (!node) return;
        
        // Get the branch point - for now, allow branching from the current position in conversation
        const branchPoint = this.app.currentMessages.length;
        
        // Ask user for branch point
        const userBranchPoint = prompt(`Create branch at message index (0-${node.messages.length}):`, branchPoint.toString());
        if (userBranchPoint === null) return;
        
        const actualBranchPoint = Math.max(0, Math.min(parseInt(userBranchPoint) || branchPoint, node.messages.length));
        
        try {
            // First save current conversation state
            await this.app.saveConversation(true);
            
            // Create the branch with messages up to the branch point
            const branchMessages = node.messages.slice(0, actualBranchPoint);
            
            const response = await this.app.fetchWithAuth(`${this.app.apiBase}/branches`, {
                method: 'POST',
                body: JSON.stringify({
                    binId: this.app.currentBin.id,
                    conversationId: this.app.currentConversationId,
                    branchPoint: actualBranchPoint,
                    messages: branchMessages,
                    metadata: {
                        createdFrom: this.selectedNodeId,
                        createdAt: new Date().toISOString(),
                        name: `Branch from ${this.selectedNodeId === 'main' ? 'main' : 'branch'} at message ${actualBranchPoint}`
                    }
                })
            });
            
            if (!response.ok) throw new Error('Failed to create branch');
            
            const branch = await response.json();
            
            // Reload and render
            await this.loadConversationData();
            this.render();
            
            this.app.showNotification(`Branch created at message ${actualBranchPoint}`, 'success');
        } catch (error) {
            console.error('Failed to create branch:', error);
            this.app.showNotification('Failed to create branch', 'error');
        }
    }
    
    async mergeBranch() {
        if (!this.selectedNodeId || this.selectedNodeId === 'main') {
            this.app.showNotification('Select a branch to merge', 'warning');
            return;
        }
        
        if (!confirm('Merge this branch into the main timeline? This will replace the conversation after the branch point.')) {
            return;
        }
        
        try {
            const response = await this.app.fetchWithAuth(`${this.app.apiBase}/branches`, {
                method: 'PUT',
                body: JSON.stringify({
                    binId: this.app.currentBin.id,
                    conversationId: this.app.currentConversationId,
                    branchId: this.selectedNodeId,
                    action: 'merge'
                })
            });
            
            if (!response.ok) throw new Error('Failed to merge branch');
            
            const result = await response.json();
            
            // Update main conversation
            this.app.currentMessages = result.conversation.messages;
            await this.app.renderConversation();
            
            // Reload loom
            await this.loadConversationData();
            this.render();
            
            this.app.showNotification('Branch merged successfully', 'success');
        } catch (error) {
            console.error('Failed to merge branch:', error);
            this.app.showNotification('Failed to merge branch', 'error');
        }
    }
    
    reset() {
        this.selectedNodeId = 'main';
        this.selectNode('main');
    }
    
    undo() {
        this.app.showNotification('Undo not yet implemented', 'info');
    }
    
    showFilter() {
        this.app.showNotification('Filter not yet implemented', 'info');
    }
    
    setView(mode) {
        this.viewMode = mode;
        
        // Update button states
        document.querySelectorAll('.loom-view-controls .loom-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (mode === 'tree') document.getElementById('viewTree').classList.add('active');
        else if (mode === 'graph') document.getElementById('viewGraph').classList.add('active');
        else if (mode === 'timeline') document.getElementById('viewTimeline').classList.add('active');
        
        this.render();
    }
    
    updateStats() {
        document.getElementById('currentTimeline').textContent = 
            this.currentNodeId === 'main' ? 'MAIN' : `BRANCH-${this.currentNodeId.substring(0, 8)}`;
        document.getElementById('branchDepth').textContent = 
            this.nodes.get(this.currentNodeId)?.depth || 0;
        document.getElementById('branchCount').textContent = this.branches.length;
        document.getElementById('nodeCount').textContent = this.nodes.size;
    }
    
    updateThreadList() {
        const threadList = document.getElementById('threadList');
        threadList.innerHTML = '';
        
        // Add main thread
        const mainThread = document.createElement('div');
        mainThread.className = 'thread-item';
        if (this.selectedNodeId === 'main') {
            mainThread.classList.add('active');
        }
        
        const mainNode = this.nodes.get('main');
        mainThread.innerHTML = `
            <div class="thread-name">MAIN TIMELINE</div>
            <div class="thread-meta">
                <span>Messages: ${mainNode.messages.length}</span>
                <span>Status: ACTIVE</span>
            </div>
        `;
        mainThread.addEventListener('click', () => this.selectNode('main'));
        threadList.appendChild(mainThread);
        
        // Add branches
        this.branches.forEach(branch => {
            const threadItem = document.createElement('div');
            threadItem.className = 'thread-item';
            if (this.selectedNodeId === branch.id) {
                threadItem.classList.add('active');
            }
            
            threadItem.innerHTML = `
                <div class="thread-name">BRANCH ${branch.id.substring(0, 8)}</div>
                <div class="thread-meta">
                    <span>Messages: ${branch.messages.length}</span>
                    <span>Point: ${branch.branchPoint}</span>
                </div>
            `;
            threadItem.addEventListener('click', () => this.selectNode(branch.id));
            threadList.appendChild(threadItem);
        });
    }
    
    updateStatus(status) {
        document.getElementById('loomStatus').textContent = status;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Export for use in main app
window.ConversationLoom = ConversationLoom;