// TuneForge Login Handler
class TuneForgeLogin {
    constructor() {
        this.apiBase = '/api';
        this.setupForm();
        this.checkExistingSession();
    }
    
    async checkExistingSession() {
        // Check if already logged in (check both storage types for compatibility)
        const sessionToken = localStorage.getItem('tuneforge_session') || sessionStorage.getItem('tuneforge_session');
        if (sessionToken) {
            try {
                // Verify session is valid
                const response = await fetch(`${this.apiBase}/bins-fixed`, {
                    headers: { 
                        'X-Session-Token': sessionToken,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    // Valid session, redirect to app
                    window.location.href = '/';
                    return;
                }
            } catch (error) {
                // Invalid session, clear it
                sessionStorage.removeItem('tuneforge_session');
                localStorage.removeItem('tuneforge_session');
            }
        }
    }
    
    setupForm() {
        const form = document.getElementById('authForm');
        const emailInput = document.getElementById('authEmail');
        const passwordInput = document.getElementById('authPassword');
        const passwordConfirmInput = document.getElementById('authPasswordConfirm');
        const submitBtn = document.getElementById('authSubmit');
        
        // Handle form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleAuth();
        });
        
        // Auto-focus email field
        emailInput.focus();
    }
    
    async handleAuth() {
        const emailInput = document.getElementById('authEmail');
        const passwordInput = document.getElementById('authPassword');
        const passwordConfirmInput = document.getElementById('authPasswordConfirm');
        const passwordFields = document.getElementById('passwordFields');
        const confirmContainer = document.getElementById('confirmContainer');
        const submitBtn = document.getElementById('authSubmit');
        const errorEl = document.getElementById('authError');
        const messageEl = document.getElementById('authMessage');
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;
        
        // Clear previous messages
        errorEl.textContent = '';
        messageEl.textContent = '';
        
        if (!email) {
            errorEl.textContent = 'Email required';
            return;
        }
        
        // State 1: Check if user exists
        if (passwordFields.style.display === 'none') {
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'CHECKING... <span class="spinner"></span>';
            
            try {
                const response = await fetch(`${this.apiBase}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                console.log('User check response:', data);
                
                // Show password fields
                passwordFields.style.display = 'block';
                passwordInput.focus();
                
                if (data.requiresPassword === true) {
                    // New user - show confirm field
                    confirmContainer.style.display = 'block';
                    messageEl.textContent = data.message || 'Create your password';
                    submitBtn.textContent = 'CREATE ACCOUNT';
                } else {
                    // Existing user
                    messageEl.textContent = data.message || 'Enter your password';
                    submitBtn.textContent = 'LOGIN';
                }
                
            } catch (error) {
                console.error('Error checking user:', error);
                errorEl.textContent = 'Error checking user. Please try again.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = submitBtn.textContent.replace(/<span.*<\/span>/, '');
            }
            
            return;
        }
        
        // State 2: Create account or login
        if (!password) {
            errorEl.textContent = 'Password required';
            return;
        }
        
        // If creating account, check password confirmation
        if (confirmContainer.style.display !== 'none' && password !== passwordConfirm) {
            errorEl.textContent = 'Passwords do not match';
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'AUTHENTICATING... <span class="spinner"></span>';
        
        try {
            // For new users, first create the account
            if (confirmContainer.style.display !== 'none') {
                const createResponse = await fetch(`${this.apiBase}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email, 
                        password, 
                        passwordConfirm 
                    })
                });
                
                const createData = await createResponse.json();
                
                if (!createData.success) {
                    errorEl.textContent = createData.error || 'Failed to create account';
                    return;
                }
                
                // Store session if provided
                if (createData.session) {
                    sessionStorage.setItem('tuneforge_session', createData.session);
                    localStorage.setItem('tuneforge_session', createData.session);
                    window.location.href = '/';
                    return;
                }
            }
            
            // Login
            const loginResponse = await fetch(`${this.apiBase}/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });
            
            const loginData = await loginResponse.json();
            console.log('Login response:', loginData);
            
            if (loginData.success && loginData.session) {
                // Store session and redirect (use localStorage for cross-tab persistence)
                sessionStorage.setItem('tuneforge_session', loginData.session);
                localStorage.setItem('tuneforge_session', loginData.session);
                messageEl.textContent = 'Login successful! Redirecting...';
                
                // Short delay for user feedback
                setTimeout(() => {
                    window.location.href = '/';
                }, 500);
            } else {
                errorEl.textContent = loginData.error || 'Login failed';
            }
            
        } catch (error) {
            console.error('Auth error:', error);
            errorEl.textContent = 'Authentication failed. Please try again.';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.textContent.replace(/<span.*<\/span>/, '');
        }
    }
}

// Initialize login handler
document.addEventListener('DOMContentLoaded', () => {
    new TuneForgeLogin();
});