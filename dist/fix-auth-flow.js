// Fix for authentication flow issues
console.log('[Auth Flow Fix] Starting...');

// Function to handle auth redirect with better error handling
function handleAuthRedirect() {
    try {
        // Check if we're already on login page
        if (window.location.pathname.includes('login.html')) {
            console.log('[Auth Flow Fix] Already on login page');
            return;
        }
        
        // Check environment
        const isCloudflare = window.location.hostname.includes('pages.dev') || 
                          window.location.hostname.includes('cloudflare') ||
                          window.location.hostname.includes('tuneforge.sh');
        
        console.log('[Auth Flow Fix] Environment:', {
            hostname: window.location.hostname,
            isCloudflare: isCloudflare
        });
        
        if (isCloudflare) {
            const sessionToken = sessionStorage.getItem('tuneforge_session');
            console.log('[Auth Flow Fix] Session token exists:', !!sessionToken);
            
            if (!sessionToken) {
                console.log('[Auth Flow Fix] No session, redirecting to login...');
                // Update UI to show redirect message
                const statusEl = document.getElementById('connectionStatus');
                if (statusEl) {
                    statusEl.textContent = 'REDIRECTING TO LOGIN...';
                }
                
                // Small delay to ensure user sees the message
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 100);
                
                // Prevent further execution
                throw new Error('Redirecting to login');
            }
        }
        
        console.log('[Auth Flow Fix] Auth check passed');
    } catch (error) {
        if (error.message !== 'Redirecting to login') {
            console.error('[Auth Flow Fix] Error:', error);
            // Fallback redirect
            window.location.href = '/login.html';
        }
    }
}

// Run immediately
handleAuthRedirect();

// Also intercept the TuneForgeUltimate constructor to add better error handling
if (typeof TuneForgeUltimate !== 'undefined') {
    const OriginalTuneForgeUltimate = TuneForgeUltimate;
    
    window.TuneForgeUltimate = function() {
        console.log('[Auth Flow Fix] Intercepted TuneForgeUltimate constructor');
        try {
            // Run auth check first
            handleAuthRedirect();
            // Call original constructor
            return new OriginalTuneForgeUltimate();
        } catch (error) {
            console.error('[Auth Flow Fix] Constructor error:', error);
            if (error.message !== 'Redirecting to login') {
                throw error;
            }
        }
    };
    
    // Copy prototype
    window.TuneForgeUltimate.prototype = OriginalTuneForgeUltimate.prototype;
}