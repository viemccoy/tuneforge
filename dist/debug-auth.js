// Debug script to diagnose auth issues
console.log('=== AUTH DEBUG SCRIPT LOADED ===');

// Check if button exists
const checkButton = () => {
    const btn = document.getElementById('authSubmit');
    console.log('Auth button found:', !!btn);
    if (btn) {
        console.log('Button text:', btn.textContent);
        console.log('Button disabled:', btn.disabled);
        console.log('Button display:', window.getComputedStyle(btn).display);
        console.log('Button z-index:', window.getComputedStyle(btn).zIndex);
        console.log('Button pointer-events:', window.getComputedStyle(btn).pointerEvents);
    }
};

// Check modal state
const checkModal = () => {
    const modal = document.getElementById('authModal');
    console.log('Modal found:', !!modal);
    if (modal) {
        console.log('Modal classes:', modal.className);
        console.log('Modal display:', window.getComputedStyle(modal).display);
        console.log('Modal z-index:', window.getComputedStyle(modal).zIndex);
    }
};

// Add test click handler
const addTestHandler = () => {
    const btn = document.getElementById('authSubmit');
    if (btn) {
        // Remove all existing handlers first
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Add new handler
        newBtn.addEventListener('click', (e) => {
            console.log('TEST HANDLER: Button clicked!');
            console.log('Event:', e);
            console.log('Target:', e.target);
            console.log('Current target:', e.currentTarget);
            
            // Try to call authenticate
            if (window.tuneforge && window.tuneforge.authenticate) {
                console.log('Calling authenticate...');
                window.tuneforge.authenticate();
            } else {
                console.log('tuneforge.authenticate not found!');
            }
        });
        
        console.log('Test handler added to button');
    }
};

// Run checks
setTimeout(() => {
    console.log('\n=== Running auth debug checks ===');
    checkButton();
    checkModal();
    addTestHandler();
    
    // Also check for overlapping elements
    const btn = document.getElementById('authSubmit');
    if (btn) {
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);
        console.log('Element at button center:', topElement);
        console.log('Is it the button?', topElement === btn);
    }
}, 1000);