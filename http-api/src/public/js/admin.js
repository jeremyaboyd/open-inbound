const API_BASE = '/api';

// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/index.html';
}

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
};

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.section + 'Section').classList.add('active');
    });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/index.html';
});

// Load users
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/admin/users`, { headers });
        const users = await response.json();
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '';

        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.innerHTML = `
                <div class="user-header">
                    <div class="user-email">${user.email}</div>
                    <div class="user-actions">
                        <button class="btn btn-primary btn-small" onclick="editUser('${user.id}')">Edit</button>
                        <button class="btn btn-secondary btn-small" onclick="deleteUser('${user.id}')">Delete</button>
                    </div>
                </div>
                <div class="user-details">
                    <div class="user-detail"><strong>API Access:</strong> ${user.api_access_enabled ? 'Enabled' : 'Disabled'}</div>
                    <div class="user-detail"><strong>Webhook:</strong> ${user.webhook_enabled ? 'Enabled' : 'Disabled'}</div>
                    <div class="user-detail"><strong>Retention:</strong> ${user.retention_days} days</div>
                    <div class="user-detail"><strong>Attachments:</strong> ${user.attachments_enabled ? 'Enabled' : 'Disabled'}</div>
                    ${user.banned_until ? `<div class="user-detail"><strong>Banned Until:</strong> ${new Date(user.banned_until).toLocaleString()}</div>` : ''}
                </div>
            `;
            usersList.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading users:', error);
    }
}


// User modal
const modal = document.getElementById('userModal');
const closeBtn = document.querySelector('.close');
const cancelBtn = document.getElementById('cancelBtn');

closeBtn.onclick = () => modal.style.display = 'none';
cancelBtn.onclick = () => modal.style.display = 'none';
window.onclick = (e) => {
    if (e.target === modal) modal.style.display = 'none';
};

document.getElementById('addUserBtn').addEventListener('click', () => {
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('password').required = true;
    modal.style.display = 'block';
});

window.editUser = async (userId) => {
    try {
        const response = await fetch(`${API_BASE}/admin/users`, { headers });
        const users = await response.json();
        const user = users.find(u => u.id === userId);
        
        if (user) {
            document.getElementById('modalTitle').textContent = 'Edit User';
            document.getElementById('userId').value = user.id;
            document.getElementById('username').value = user.username;
            document.getElementById('domain').value = user.domain;
            document.getElementById('apiAccessEnabled').checked = user.api_access_enabled;
            document.getElementById('webhookEnabled').checked = user.webhook_enabled;
            document.getElementById('webhookUrl').value = user.webhook_url || '';
            document.getElementById('retentionDays').value = user.retention_days;
            document.getElementById('attachmentsEnabled').checked = user.attachments_enabled;
            document.getElementById('bannedUntil').value = user.banned_until ? 
                new Date(user.banned_until).toISOString().slice(0, 16) : '';
            document.getElementById('passwordGroup').style.display = 'none';
            document.getElementById('password').required = false;
            toggleWebhookUrl();
            modal.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
};

document.getElementById('webhookEnabled').addEventListener('change', toggleWebhookUrl);
function toggleWebhookUrl() {
    const enabled = document.getElementById('webhookEnabled').checked;
    document.getElementById('webhookUrlGroup').style.display = enabled ? 'block' : 'none';
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('userId').value;
    const userData = {
        username: document.getElementById('username').value,
        domain: document.getElementById('domain').value,
        api_access_enabled: document.getElementById('apiAccessEnabled').checked,
        webhook_enabled: document.getElementById('webhookEnabled').checked,
        webhook_url: document.getElementById('webhookUrl').value || null,
        retention_days: parseInt(document.getElementById('retentionDays').value),
        attachments_enabled: document.getElementById('attachmentsEnabled').checked,
        banned_until: document.getElementById('bannedUntil').value ? 
            new Date(document.getElementById('bannedUntil').value).toISOString() : null,
    };

    if (userId) {
        // Update
        if (document.getElementById('password').value) {
            userData.password = document.getElementById('password').value;
        }
        try {
            const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(userData),
            });

            if (response.ok) {
                modal.style.display = 'none';
                loadUsers();
            } else {
                alert('Failed to update user');
            }
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Error updating user');
        }
    } else {
        // Create
        userData.password = document.getElementById('password').value;
        try {
            const response = await fetch(`${API_BASE}/admin/users`, {
                method: 'POST',
                headers,
                body: JSON.stringify(userData),
            });

            if (response.ok) {
                modal.style.display = 'none';
                loadUsers();
            } else {
                const data = await response.json();
                alert('Failed to create user: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert('Error creating user');
        }
    }
});

window.deleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user? All their emails will be deleted.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'DELETE',
            headers,
        });

        if (response.ok) {
            loadUsers();
        } else {
            alert('Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        alert('Error deleting user');
    }
};

// Initialize
loadUsers();
