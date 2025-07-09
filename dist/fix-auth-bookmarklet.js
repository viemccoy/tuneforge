// Bookmarklet to fix auth button
// Copy this as a bookmark URL: javascript:(function(){...})();

(function() {
    console.log('Applying auth fix...');
    
    // Find the button
    const btn = document.getElementById('authSubmit');
    if (!btn) {
        alert('Auth button not found!');
        return;
    }
    
    // Remove all event listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    // Add a simple click handler
    newBtn.onclick = function() {
        console.log('Fixed button clicked!');
        
        // Get the app instance
        if (window.tuneforge && window.tuneforge.authenticate) {
            window.tuneforge.authenticate();
        } else {
            // Fallback: manually trigger the authentication
            const email = document.getElementById('authEmail').value;
            if (!email) {
                alert('Please enter your email');
                return;
            }
            
            // Show password fields
            const passwordFields = document.getElementById('passwordFields');
            if (passwordFields && passwordFields.style.display === 'none') {
                passwordFields.style.display = 'block';
                document.getElementById('authPassword').focus();
                newBtn.textContent = 'LOGIN';
            } else {
                // Try to login
                const password = document.getElementById('authPassword').value;
                if (!password) {
                    alert('Please enter your password');
                    return;
                }
                
                // Do the login
                fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password })
                })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        sessionStorage.setItem('tuneforge_session', data.session);
                        window.location.reload();
                    } else {
                        alert('Login failed: ' + (data.error || 'Unknown error'));
                    }
                })
                .catch(err => alert('Error: ' + err.message));
            }
        }
    };
    
    // Make sure button is enabled
    newBtn.disabled = false;
    newBtn.style.pointerEvents = 'auto';
    newBtn.style.cursor = 'pointer';
    newBtn.style.opacity = '1';
    
    console.log('Auth fix applied!');
    alert('Auth button fixed! Try clicking it now.');
})();