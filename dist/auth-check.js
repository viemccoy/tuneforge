// Simple auth check script to ensure proper redirect
(function() {
    console.log('[Auth Check] Running auth check...');
    
    // Check if we're already on the login page
    if (window.location.pathname.includes('login.html')) {
        console.log('[Auth Check] Already on login page, skipping check');
        return;
    }
    
    // Check if this is Cloudflare environment
    const isCloudflare = window.location.hostname.includes('pages.dev') || 
                      window.location.hostname.includes('cloudflare') ||
                      window.location.hostname.includes('tuneforge.sh');
    
    console.log('[Auth Check] Is Cloudflare:', isCloudflare);
    
    if (isCloudflare) {
        // Check for session token
        const sessionToken = sessionStorage.getItem('tuneforge_session');
        console.log('[Auth Check] Session token exists:', !!sessionToken);
        
        if (!sessionToken) {
            console.log('[Auth Check] No session token, redirecting to login...');
            window.location.href = '/login.html';
        }
    }
})();