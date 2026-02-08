const API_BASE = '/api';

// Check if already logged in
const token = localStorage.getItem('token');
if (token) {
    window.location.href = '/inbox.html';
}

let registrationEnabled = false;

// Check registration status on page load
async function checkRegistrationStatus() {
    try {
        const response = await fetch(`${API_BASE}/auth/settings`);
        const data = await response.json();
        registrationEnabled = data.registration_enabled === true;
        
        // Show/hide registration toggle based on status
        const authToggle = document.getElementById('authToggle');
        if (registrationEnabled) {
            authToggle.style.display = 'block';
        } else {
            authToggle.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking registration status:', error);
        // Default to hiding registration if check fails
        document.getElementById('authToggle').style.display = 'none';
    }
}

// Toggle between login and registration forms
function toggleAuthForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const toggleText = document.getElementById('toggleText');
    const toggleLink = document.getElementById('toggleLink');
    
    if (loginForm.style.display === 'none') {
        // Show login form
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        toggleText.textContent = "Don't have an account? ";
        toggleLink.textContent = 'Register';
    } else {
        // Show registration form
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        toggleText.textContent = 'Already have an account? ';
        toggleLink.textContent = 'Login';
    }
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginErrorMessage');

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            window.location.href = '/inbox.html';
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
    }
});

// Registration form handler
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const errorDiv = document.getElementById('registerErrorMessage');

    // Validate passwords match
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }

    // Validate password length
    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        errorDiv.style.display = 'block';
        return;
    }

    // Check registration is enabled
    if (!registrationEnabled) {
        errorDiv.textContent = 'Registration is currently disabled';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            window.location.href = '/inbox.html';
        } else {
            errorDiv.textContent = data.error || 'Registration failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
    }
});

// Toggle link handler
document.getElementById('toggleLink').addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthForm();
});

// Initialize on page load
checkRegistrationStatus();
