// Emergency auth override - add this to the page to fix login
console.log('Loading auth override...');

// Wait for page to load
window.addEventListener('load', () => {
    console.log('Page loaded, applying auth override...');
    
    // Override the authenticate function to ensure it works
    const fixAuth = setInterval(() => {
        if (window.tuneforge) {
            console.log('Found tuneforge instance');
            
            // Save the original authenticate function
            const originalAuth = window.tuneforge.authenticate.bind(window.tuneforge);
            
            // Create a working version
            window.tuneforge.authenticate = async function() {
                console.log('Override authenticate called');
                
                const email = document.getElementById('authEmail').value.trim();
                const password = document.getElementById('authPassword').value;
                const passwordFields = document.getElementById('passwordFields');
                const authSubmitBtn = document.getElementById('authSubmit');
                const errorEl = document.getElementById('authError');
                const messageEl = document.getElementById('authMessage');
                
                if (!email) {
                    errorEl.textContent = 'Email required';
                    return;
                }
                
                // If password fields not visible, show them
                if (!passwordFields || passwordFields.style.display === 'none' || passwordFields.style.display === '') {
                    console.log('Showing password fields');
                    
                    try {
                        const response = await fetch('/api/users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email })
                        });
                        
                        const data = await response.json();
                        console.log('User check response:', data);
                        
                        passwordFields.style.display = 'block';
                        document.getElementById('authPassword').focus();
                        
                        if (data.requiresPassword === true) {
                            document.getElementById('authPasswordConfirm').style.display = 'block';
                            document.getElementById('confirmLabel').style.display = 'block';
                            messageEl.textContent = data.message || 'Create your password';
                            authSubmitBtn.textContent = 'CREATE PASSWORD';
                        } else {
                            messageEl.textContent = data.message || 'Enter your password';
                            authSubmitBtn.textContent = 'LOGIN';
                        }
                        
                    } catch (error) {
                        console.error('Error checking user:', error);
                        errorEl.textContent = 'Error: ' + error.message;
                    }
                    
                    return;
                }
                
                // Password fields visible, do login
                if (!password) {
                    errorEl.textContent = 'Password required';
                    return;
                }
                
                console.log('Attempting login...');
                authSubmitBtn.textContent = 'LOGGING IN...';
                authSubmitBtn.disabled = true;
                
                try {
                    const response = await fetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ email, password })
                    });
                    
                    const data = await response.json();
                    console.log('Login response:', data);
                    
                    if (data.success && data.session) {
                        sessionStorage.setItem('tuneforge_session', data.session);
                        window.tuneforge.currentUser = data.user;
                        window.tuneforge.authenticated = true;
                        
                        // Hide modal and initialize
                        document.getElementById('authModal').classList.remove('active');
                        if (window.tuneforge.initialize) {
                            window.tuneforge.initialize();
                        }
                    } else {
                        errorEl.textContent = data.error || 'Login failed';
                        authSubmitBtn.textContent = 'LOGIN';
                        authSubmitBtn.disabled = false;
                    }
                    
                } catch (error) {
                    console.error('Login error:', error);
                    errorEl.textContent = 'Error: ' + error.message;
                    authSubmitBtn.textContent = 'LOGIN';
                    authSubmitBtn.disabled = false;
                }
            };
            
            // Fix the button
            const btn = document.getElementById('authSubmit');
            if (btn) {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Button clicked via override');
                    window.tuneforge.authenticate();
                };
                
                console.log('Button handler replaced');
            }
            
            clearInterval(fixAuth);
            console.log('Auth override applied successfully!');
        }
    }, 100);
});

// Also add global Enter key handler
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('authModal').classList.contains('active')) {
        const activeElement = document.activeElement;
        if (activeElement && ['authEmail', 'authPassword', 'authPasswordConfirm'].includes(activeElement.id)) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Enter key pressed in auth field');
            if (window.tuneforge && window.tuneforge.authenticate) {
                window.tuneforge.authenticate();
            }
        }
    }
}, true);