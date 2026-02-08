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

let currentPage = 0;
const emailsPerPage = 50;
let totalEmails = 0;
let currentEmails = [];

// Decode JWT to get user email
function getUserEmail() {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.email || 'User';
    } catch (error) {
        return 'User';
    }
}

// Set user email in header
document.getElementById('userEmail').textContent = getUserEmail();

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/index.html';
});

// Refresh handler
document.getElementById('refreshBtn').addEventListener('click', () => {
    loadEmails(currentPage);
});

// Load emails from API
async function loadEmails(page = 0) {
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const emailList = document.getElementById('emailList');
    const pagination = document.getElementById('pagination');

    loadingState.style.display = 'block';
    emptyState.style.display = 'none';
    emailList.innerHTML = '';
    pagination.style.display = 'none';

    try {
        const offset = page * emailsPerPage;
        const response = await fetch(`${API_BASE}/emails?limit=${emailsPerPage}&offset=${offset}`, {
            headers,
        });

        if (response.status === 401) {
            // Unauthorized - redirect to login
            localStorage.removeItem('token');
            window.location.href = '/index.html';
            return;
        }

        const data = await response.json();

        loadingState.style.display = 'none';
        currentEmails = data.emails || [];
        totalEmails = data.total || 0;

        // Update email count
        document.getElementById('emailCount').textContent = `${totalEmails} email${totalEmails !== 1 ? 's' : ''}`;

        if (currentEmails.length === 0) {
            emptyState.style.display = 'block';
            return;
        }

        // Display emails
        currentEmails.forEach((email) => {
            const emailItem = createEmailItem(email);
            emailList.appendChild(emailItem);
        });

        // Show pagination if needed
        if (totalEmails > emailsPerPage) {
            pagination.style.display = 'flex';
            updatePaginationInfo();
        }
    } catch (error) {
        console.error('Error loading emails:', error);
        loadingState.style.display = 'none';
        emailList.innerHTML = '<div class="error-message">Error loading emails. Please try again.</div>';
    }
}

// Create email list item
function createEmailItem(email) {
    const item = document.createElement('div');
    item.className = 'email-item';
    item.dataset.emailId = email.id;

    const date = new Date(email.receivedAt);
    const attachmentBadge = email.attachmentCount > 0 
        ? `<span class="attachment-badge">${email.attachmentCount}</span>` 
        : '';

    item.innerHTML = `
        <div class="email-item-content">
            <div class="email-item-header">
                <span class="email-from">${escapeHtml(email.from)}</span>
                <span class="email-date">${formatDate(date)}</span>
            </div>
            <div class="email-item-body">
                <span class="email-subject">${escapeHtml(email.subject || '(no subject)')}</span>
                ${attachmentBadge}
            </div>
        </div>
    `;

    item.addEventListener('click', () => {
        showEmailDetail(email.id);
    });

    return item;
}

// Show email detail
async function showEmailDetail(emailId) {
    const modal = document.getElementById('emailModal');
    const emailDetail = document.getElementById('emailDetail');

    modal.style.display = 'block';
    emailDetail.innerHTML = '<div class="loading-state">Loading email...</div>';

    try {
        const response = await fetch(`${API_BASE}/emails/${emailId}`, { headers });
        
        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/index.html';
            return;
        }

        const email = await response.json();
        renderEmailDetail(email);
    } catch (error) {
        console.error('Error loading email detail:', error);
        emailDetail.innerHTML = '<div class="error-message">Error loading email. Please try again.</div>';
    }
}

// Render email detail
function renderEmailDetail(email) {
    const emailDetail = document.getElementById('emailDetail');
    const date = new Date(email.receivedAt);

    let attachmentsHtml = '';
    if (email.attachments && email.attachments.length > 0) {
        attachmentsHtml = '<div class="email-attachments"><h4>Attachments:</h4><ul>';
        email.attachments.forEach((attachment, index) => {
            attachmentsHtml += `<li>
                <a href="#" onclick="downloadAttachment('${email.id}', ${index}, '${escapeHtml(attachment.filename)}'); return false;" class="attachment-link">
                    ${escapeHtml(attachment.filename)} (${formatFileSize(attachment.size || 0)})
                </a>
            </li>`;
        });
        attachmentsHtml += '</ul></div>';
    }

    // Get email body content
    let bodyContent = '';
    if (email.body) {
        if (email.body.html) {
            bodyContent = `<div class="email-body-html">${email.body.html}</div>`;
        } else if (email.body.text) {
            bodyContent = `<div class="email-body-text">${escapeHtml(email.body.text).replace(/\n/g, '<br>')}</div>`;
        } else if (email.body.textAsHtml) {
            bodyContent = `<div class="email-body-text">${email.body.textAsHtml}</div>`;
        }
    }

    emailDetail.innerHTML = `
        <div class="email-detail-header">
            <div class="email-detail-field">
                <strong>From:</strong> ${escapeHtml(email.from)}
            </div>
            <div class="email-detail-field">
                <strong>To:</strong> ${escapeHtml(email.to)}
            </div>
            <div class="email-detail-field">
                <strong>Subject:</strong> ${escapeHtml(email.subject || '(no subject)')}
            </div>
            <div class="email-detail-field">
                <strong>Date:</strong> ${formatDate(date)}
            </div>
        </div>
        ${attachmentsHtml}
        <div class="email-detail-body">
            ${bodyContent || '<p class="no-content">No content available</p>'}
        </div>
    `;
}

// Pagination handlers
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 0) {
        currentPage--;
        loadEmails(currentPage);
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const maxPage = Math.ceil(totalEmails / emailsPerPage) - 1;
    if (currentPage < maxPage) {
        currentPage++;
        loadEmails(currentPage);
    }
});

function updatePaginationInfo() {
    const maxPage = Math.ceil(totalEmails / emailsPerPage) - 1;
    const pageInfo = document.getElementById('pageInfo');
    pageInfo.textContent = `Page ${currentPage + 1} of ${maxPage + 1}`;

    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    prevBtn.disabled = currentPage === 0;
    nextBtn.disabled = currentPage >= maxPage;
}

// Close modal handlers
document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('emailModal').style.display = 'none';
});

window.addEventListener('click', (e) => {
    const modal = document.getElementById('emailModal');
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days > 0) {
        return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Download attachment with authentication
async function downloadAttachment(emailId, attachmentIndex, filename) {
    try {
        const response = await fetch(`${API_BASE}/emails/${emailId}/attachments/${attachmentIndex}`, {
            headers,
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/index.html';
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to download attachment');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Error downloading attachment:', error);
        alert('Failed to download attachment. Please try again.');
    }
}

// Make downloadAttachment available globally
window.downloadAttachment = downloadAttachment;

// Initialize on page load
loadEmails(0);
