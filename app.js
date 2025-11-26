// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBlpl_F6FzX3dFbWArh5V81ENpbZQ-Hir8",
    authDomain: "btc-dmb.firebaseapp.com",
    databaseURL: "https://btc-dmb-default-rtdb.firebaseio.com",
    projectId: "btc-dmb",
    storageBucket: "btc-dmb.firebasestorage.app",
    messagingSenderId: "50389039215",
    appId: "1:50389039215:android:4da8a3712be8756c34359a"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Global state
let branchesData = {};
let playbackData = {};
let usersData = {};
let currentView = 'overview';
let currentSearchQuery = '';
let driveNamesCache = {}; // Cache for Drive file names

// Pagination State
let currentPlaybackPage = 1;
let currentDevicesPage = 1;
const itemsPerPage = 10;

// Utility Functions
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
}

function formatTime(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function isDeviceOnline(lastSeen, deviceId) {
    // Check playback status if deviceId is provided
    if (deviceId && playbackData[deviceId]) {
        const status = playbackData[deviceId].status;
        if (status === 'playing' || status === 'active') {
            return true;
        }
    }

    if (!lastSeen) return false;
    const now = Date.now();
    const diff = now - lastSeen;
    // Consider device online if seen in last 30 minutes
    return diff < 30 * 60 * 1000;
}

function truncateUrl(url, maxLength = 40) {
    if (!url || url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
}

// Data Loading (Local JSON) - DISABLED
/*
async function loadLocalData() {
    try {
        console.log('📥 Fetching local data from btc-dmb-default-rtdb-export (4).json...');
        const response = await fetch('btc-dmb-default-rtdb-export (4).json');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Data loaded successfully:', data);

        // Populate global state
        branchesData = data.branches || {};
        playbackData = data.playback || {};
        usersData = data.users || {};

        // Expose for debugging
        window.branchesData = branchesData;
        window.playbackData = playbackData;
        window.usersData = usersData;

        console.log('📍 Branches:', Object.keys(branchesData).length);
        console.log('▶️ Playback:', Object.keys(playbackData).length);
        console.log('📱 Users:', Object.keys(usersData).length);

        updateUI();

    } catch (error) {
        console.error('❌ Error loading local data:', error);
        // Fallback to empty state or show error
        document.getElementById('app').innerHTML = `
            <div style="padding: 2rem; text-align: center; color: var(--error);">
                <h2>Error Loading Data</h2>
                <p>Could not load btc-dmb-default-rtdb-export.json</p>
                <p>${error.message}</p>
            </div>
        `;
    }
}
*/

// Firebase Listeners
function setupFirebaseListeners() {
    // Branches listener
    const branchesRef = ref(database, 'branches');
    onValue(branchesRef, (snapshot) => {
        branchesData = snapshot.val() || {};
        console.log('📍 Branches data received:', Object.keys(branchesData).length, 'branches');
        // console.log('Branches:', branchesData);
        window.branchesData = branchesData; // Expose for debugging

        // Prefetch Drive filenames
        prefetchDriveFilenames(branchesData);

        updateUI();
    });

    // Playback listener
    const playbackRef = ref(database, 'playback');
    onValue(playbackRef, (snapshot) => {
        playbackData = snapshot.val() || {};
        console.log('▶️ Playback data received:', Object.keys(playbackData).length, 'sessions');
        // console.log('Playback:', playbackData);
        window.playbackData = playbackData; // Expose for debugging
        updateUI();
    });

    // Users listener
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
        usersData = snapshot.val() || {};
        console.log('📱 Users data received:', Object.keys(usersData).length, 'devices');
        // console.log('Users:', usersData);
        window.usersData = usersData; // Expose for debugging
        updateUI();
    });
}

// UI Update Functions
function updateUI() {
    updateLastUpdatedTime();
    updateConnectionStatus();

    if (currentView === 'overview') {
        updateOverviewView();
    } else if (currentView === 'branches') {
        updateBranchesView();
    } else if (currentView === 'playback') {
        updatePlaybackView();
    } else if (currentView === 'devices') {
        updateDevicesView();
    }
}

function updateLastUpdatedTime() {
    const timeElement = document.getElementById('last-updated-time');
    const now = new Date();
    timeElement.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function updateConnectionStatus() {
    const statusIndicator = document.getElementById('connection-status');
    const statusText = document.getElementById('connection-text');

    statusIndicator.classList.add('connected');
    statusText.textContent = 'Connected';
}

function updateOverviewView() {
    // Update statistics
    const branchCount = Object.keys(branchesData).length;
    const deviceCount = Object.keys(usersData).length;
    const now = Date.now();
    const THRESHOLD = 30 * 60 * 1000; // 30 minutes

    const playbackCount = Object.values(playbackData).filter(session => {
        if (session.lastSeen) {
            return (now - session.lastSeen) < THRESHOLD;
        } else if (session.timestamp) {
            return (now - session.timestamp) < THRESHOLD;
        }
        return false;
    }).length;

    const turnedOffCount = Object.values(playbackData).filter(session =>
        session.status === 'background'
    ).length;

    document.getElementById('stat-branches').textContent = branchCount;
    document.getElementById('stat-devices').textContent = deviceCount;
    document.getElementById('stat-playback').textContent = playbackCount;
    document.getElementById('stat-turned-off').textContent = turnedOffCount;

    // Update pricing version chart
    updatePricingChart();

    // Update device types chart
    updateDeviceTypesChart();

    // Update recent activity
    updateRecentActivity();
}

function updatePricingChart() {
    const pricingCounts = {};

    Object.values(branchesData).forEach(branch => {
        const version = branch.pricingVersion || 'Unknown';
        pricingCounts[version] = (pricingCounts[version] || 0) + 1;
    });

    const chartContainer = document.getElementById('pricing-chart');
    const total = Object.values(pricingCounts).reduce((a, b) => a + b, 0);

    if (total === 0) {
        chartContainer.innerHTML = '<div class="empty-state"><p>No pricing data available</p></div>';
        return;
    }

    chartContainer.innerHTML = Object.entries(pricingCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([version, count]) => {
            const percentage = (count / total * 100).toFixed(1);
            return `
                <div class="chart-bar">
                    <div class="chart-label">${version}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${percentage}%">
                            <span class="chart-value">${count}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
}

function updateDeviceTypesChart() {
    const typeCounts = {};

    Object.values(usersData).forEach(device => {
        const type = device.deviceType || 'Unknown';
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    const chartContainer = document.getElementById('device-types-chart');
    const total = Object.values(typeCounts).reduce((a, b) => a + b, 0);

    if (total === 0) {
        chartContainer.innerHTML = '<div class="empty-state"><p>No device data available</p></div>';
        return;
    }

    chartContainer.innerHTML = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => {
            const percentage = (count / total * 100).toFixed(1);
            return `
                <div class="chart-bar">
                    <div class="chart-label">${type}</div>
                    <div class="chart-bar-container">
                        <div class="chart-bar-fill" style="width: ${percentage}%">
                            <span class="chart-value">${count}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
}

function updateRecentActivity() {
    const activityContainer = document.getElementById('recent-activity');

    // Combine all activities
    const activities = [];

    // Playback activities
    Object.entries(playbackData).forEach(([deviceId, session]) => {
        activities.push({
            type: 'playback',
            timestamp: session.timestamp,
            deviceId: deviceId,
            branchName: session.branchName,
            category: session.category
        });
    });

    // Device activities
    Object.entries(usersData).forEach(([deviceId, device]) => {
        if (device.lastSeen) {
            activities.push({
                type: 'device',
                timestamp: device.lastSeen,
                deviceId: deviceId,
                deviceType: device.deviceType,
                deviceModel: device.deviceModel
            });
        }
    });

    // Sort by timestamp and take top 10
    activities.sort((a, b) => b.timestamp - a.timestamp);
    const recentActivities = activities.slice(0, 10);

    if (recentActivities.length === 0) {
        activityContainer.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
        return;
    }

    activityContainer.innerHTML = recentActivities.map(activity => {
        if (activity.type === 'playback') {
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/>
                        </svg>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">Playback started: ${activity.category}</div>
                        <div class="activity-meta">${activity.branchName} • ${formatTimestamp(activity.timestamp)}</div>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
                            <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z"/>
                        </svg>
                    </div>
                    <div class="activity-content">
                        <div class="activity-title">Device activity: ${activity.deviceType}</div>
                        <div class="activity-meta">${activity.deviceModel} • ${formatTimestamp(activity.timestamp)}</div>
                    </div>
                </div>
            `;
        }
    }).join('');
}

// Helper to extract filename from URL
function getLinkName(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;

        // Handle Dropbox
        if (url.includes('dropbox.com')) {
            const parts = pathname.split('/');
            // Dropbox format: /scl/fi/<id>/<filename>
            // or /s/..../<filename>
            const filename = parts[parts.length - 1];
            return decodeURIComponent(filename);
        }

        // Handle Google Drive
        if (url.includes('drive.google.com')) {
            // Try to extract ID
            const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match) {
                const fileId = match[1];
                if (driveNamesCache[fileId]) {
                    return driveNamesCache[fileId];
                }
                return 'Loading...';
            }
            return 'Drive Content';
        }

        // Generic file extension
        const filename = pathname.split('/').pop();
        if (filename && filename.includes('.')) {
            return decodeURIComponent(filename);
        }

        return 'View Content';
    } catch (e) {
        return 'View Content';
    }
}

// Fetch single Drive file name (for playback view or cache misses)
async function fetchDriveFileName(fileId) {
    if (driveNamesCache[fileId]) return; // Already cached or fetching

    driveNamesCache[fileId] = 'Loading...'; // Set temporary state
    updateUI(); // Show loading state

    try {
        const apiKey = firebaseConfig.apiKey;
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=name`);

        if (response.ok) {
            const data = await response.json();
            if (data.name) {
                driveNamesCache[fileId] = data.name;
            }
        } else {
            const errorData = await response.json();
            console.warn('Failed to fetch Drive file name:', response.status, errorData);
            driveNamesCache[fileId] = 'Drive Content';
        }
    } catch (error) {
        console.error('Error fetching Drive file name:', error);
        driveNamesCache[fileId] = 'Drive Content';
    }

    updateUI(); // Update UI with result
}

// Prefetch all Drive filenames from branches data
async function prefetchDriveFilenames(branches) {
    const driveIds = new Set();
    const apiKey = firebaseConfig.apiKey;

    // Extract all Drive IDs
    Object.values(branches).forEach(branch => {
        const urls = [
            branch.beverage,
            branch.food,
            ...(branch.retail ? branch.retail.split(',') : [])
        ];

        urls.forEach(url => {
            if (url && url.includes('drive.google.com')) {
                const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    driveIds.add(match[1]);
                }
            }
        });
    });

    // Filter out already cached IDs
    const idsToFetch = Array.from(driveIds).filter(id => !driveNamesCache[id]);

    if (idsToFetch.length === 0) return;

    console.log(`🔄 Prefetching ${idsToFetch.length} Drive filenames...`);

    // Fetch in parallel (with limit if needed, but for now simple parallel)
    const fetchPromises = idsToFetch.map(async (fileId) => {
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?key=${apiKey}&fields=name`);
            if (response.ok) {
                const data = await response.json();
                if (data.name) {
                    driveNamesCache[fileId] = data.name;
                }
            } else {
                const errorData = await response.json();
                console.warn(`Failed to fetch ${fileId}:`, response.status, errorData);
                driveNamesCache[fileId] = 'Drive Content';
            }
        } catch (error) {
            console.error(`Error fetching ${fileId}:`, error);
            driveNamesCache[fileId] = 'Drive Content';
        }
    });

    await Promise.all(fetchPromises);
    console.log('✅ Drive filenames prefetched');

    await Promise.all(fetchPromises);
    console.log('✅ Drive filenames prefetched');

    // Update UI once all fetched
    updateUI();
}

function updateBranchesView() {
    const branchesGrid = document.getElementById('branches-grid');
    const pricingFilter = document.getElementById('pricing-filter');

    // Update pricing filter options
    const pricingVersions = new Set();
    Object.values(branchesData).forEach(branch => {
        if (branch.pricingVersion) {
            pricingVersions.add(branch.pricingVersion);
        }
    });

    const currentFilter = pricingFilter.value;
    pricingFilter.innerHTML = '<option value="all">All Versions</option>' +
        Array.from(pricingVersions).sort().map(version =>
            `<option value="${version}">${version}</option>`
        ).join('');
    pricingFilter.value = currentFilter;

    // Filter branches
    const selectedPricing = pricingFilter.value;
    console.log('Filtering branches. Query:', currentSearchQuery, 'Pricing:', selectedPricing);

    const filteredBranches = Object.entries(branchesData).filter(([code, branch]) => {
        // Search filter
        if (currentSearchQuery) {
            const searchLower = currentSearchQuery.toLowerCase();

            // Check branch details
            const branchName = branch.branchName ? String(branch.branchName).toLowerCase() : '';
            const branchCode = code ? String(code).toLowerCase() : '';
            const pricing = branch.pricingVersion ? String(branch.pricingVersion).toLowerCase() : '';

            let matchesSearch =
                branchName.includes(searchLower) ||
                branchCode.includes(searchLower) ||
                pricing.includes(searchLower);

            // Also check associated playback sessions
            if (!matchesSearch) {
                const associatedSessions = Object.values(playbackData).filter(session =>
                    session && session.branchCode === code
                );

                matchesSearch = associatedSessions.some(session => {
                    const category = session.category ? String(session.category).toLowerCase() : '';
                    const status = session.status ? String(session.status).toLowerCase() : '';
                    const type = session.isTv ? 'tv' : 'mobile';

                    return category.includes(searchLower) ||
                        status.includes(searchLower) ||
                        type.includes(searchLower);
                });
            }

            if (!matchesSearch) return false;
        }

        if (selectedPricing === 'all') return true;
        return branch.pricingVersion === selectedPricing;
    });

    if (filteredBranches.length === 0) {
        branchesGrid.innerHTML = '<div class="empty-state"><p>No branches found</p></div>';
        return;
    }

    branchesGrid.innerHTML = filteredBranches.map(([code, branch]) => {
        // Helper to generate link HTML
        const generateLinkHtml = (url, label) => {
            if (!url) return '';
            const cleanUrl = url.trim();
            let linkName = getLinkName(cleanUrl);

            // If it's a Drive link and we have it in cache, use the cached name
            if (cleanUrl.includes('drive.google.com')) {
                const match = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    const driveId = match[1];
                    if (driveNamesCache[driveId]) {
                        linkName = driveNamesCache[driveId];
                    } else {
                        linkName = 'Loading...';
                    }
                }
            }

            return `
                <a href="${cleanUrl}" target="_blank" rel="noopener" title="${linkName}">
                    ${linkName.length > 20 ? linkName.substring(0, 17) + '...' : linkName}
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                        <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                    </svg>
                </a>
            `;
        };

        // Determine pricing class
        let pricingClass = 'pricing-not-found';
        const pricing = branch.pricingVersion ? branch.pricingVersion.toLowerCase() : '';

        if (pricing.includes('regular')) {
            pricingClass = 'pricing-regular';
        } else if (pricing.includes('premium version 2')) {
            pricingClass = 'pricing-premium-2';
        } else if (pricing.includes('premium')) {
            pricingClass = 'pricing-premium';
        }

        return `
        <div class="branch-card ${pricingClass}">
            <div class="branch-header">
                <div class="branch-info">
                    <h4>${branch.branchName}</h4>
                    <div class="branch-code">${code}</div>
                </div>
                <div class="pricing-badge">${branch.pricingVersion || 'Not Found'}</div>
            </div>
            <div class="branch-links">
                <div class="branch-link">
                    <span class="branch-link-label">Beverage Menu</span>
                    ${generateLinkHtml(branch.beverage, 'Beverage Menu')}
                </div>
                <div class="branch-link">
                    <span class="branch-link-label">Food Menu</span>
                    ${generateLinkHtml(branch.food, 'Food Menu')}
                </div>
                <div class="branch-link">
                    <span class="branch-link-label">Retail Content</span>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        ${branch.retail ? branch.retail.split(',').map((url) => generateLinkHtml(url, 'Retail Content')).join('') : '<span>N/A</span>'}
                    </div>
                </div>
            </div>
        </div>
    `}).join('');
}

// Helper to render pagination controls
function renderPaginationControls(currentPage, totalPages, viewName) {
    if (totalPages <= 1) return '';

    return `
        <div class="pagination-container">
            <button class="pagination-btn" 
                onclick="changePage('${viewName}', ${currentPage - 1})"
                ${currentPage === 1 ? 'disabled' : ''}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 18l-6-6 6-6"/>
                </svg>
                Previous
            </button>
            <span class="pagination-info">
                Page ${currentPage} of ${totalPages}
            </span>
            <button class="pagination-btn" 
                onclick="changePage('${viewName}', ${currentPage + 1})"
                ${currentPage === totalPages ? 'disabled' : ''}>
                Next
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </button>
        </div>
    `;
}

// Global function for pagination clicks
window.changePage = function (viewName, newPage) {
    if (viewName === 'playback') {
        currentPlaybackPage = newPage;
        updatePlaybackView();
    } else if (viewName === 'devices') {
        currentDevicesPage = newPage;
        updateDevicesView();
    }
};

function updatePlaybackView() {
    const playbackList = document.getElementById('playback-list');
    const playbackSessions = Object.entries(playbackData).filter(([deviceId, session]) => {
        // Status filter
        if (session.status !== 'playing' && session.status !== 'active') return false;

        // Search filter
        if (currentSearchQuery) {
            const searchLower = currentSearchQuery.toLowerCase();
            return (
                session.branchName.toLowerCase().includes(searchLower) ||
                deviceId.toLowerCase().includes(searchLower) ||
                (session.category && session.category.toLowerCase().includes(searchLower)) ||
                (session.branchCode && session.branchCode.toLowerCase().includes(searchLower))
            );
        }

        return true;
    });

    if (playbackSessions.length === 0) {
        playbackList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/>
                </svg>
                <h3>No Active Playback</h3>
                <p>There are currently no active playback sessions</p>
            </div>
        `;
        return;
    }

    // Pagination Logic
    const totalPages = Math.ceil(playbackSessions.length / itemsPerPage);
    if (currentPlaybackPage > totalPages) currentPlaybackPage = 1;

    const startIndex = (currentPlaybackPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedSessions = playbackSessions.slice(startIndex, endIndex);

    const listHtml = paginatedSessions.map(([deviceId, session]) => `
        <div class="playback-card">
            <div class="playback-header">
                <div class="playback-device">
                    <h4>${session.branchName}</h4>
                    <span class="device-id">${deviceId}</span>
                </div>
                <div class="playback-status">
                    <span class="status-badge ${session.status || 'active'}">${session.status || 'active'}</span>
                </div>
            </div>
            <div class="playback-details">
                <div class="playback-detail">
                    <span class="playback-detail-label">Category</span>
                    <span class="playback-detail-value">
                        <span class="category-badge ${session.category?.toLowerCase()}">${session.category}</span>
                    </span>
                </div>
                <div class="playback-detail">
                    <span class="playback-detail-label">Branch Code</span>
                    <span class="playback-detail-value">${session.branchCode}</span>
                </div>
                <div class="playback-detail">
                    <span class="playback-detail-label">App Version</span>
                    <span class="playback-detail-value">${session.appVersion || 'N/A'}</span>
                </div>
                <div class="playback-detail">
                    <span class="playback-detail-label">Started</span>
                    <span class="playback-detail-value">${formatTimestamp(session.timestamp)}</span>
                </div>
                <div class="playback-detail">
                    <span class="playback-detail-label">Last Seen</span>
                    <span class="playback-detail-value">${formatTimestamp(session.lastSeen)}</span>
                </div>
                <div class="playback-detail">
                    <span class="playback-detail-label">Device Type</span>
                    <span class="playback-detail-value">${session.isTv ? 'TV' : 'Mobile/Tablet'}</span>
                </div>
            </div>
            ${session.urls && session.urls.length > 0 ? `
                <div class="playback-detail">
                    <span class="playback-detail-label">Content URLs (${session.urls.length})</span>
                    <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.25rem;">
                        ${session.urls.slice(0, 3).map(url => {
        const cleanUrl = url.trim();
        let linkName = getLinkName(cleanUrl);

        // Handle Drive links
        if (cleanUrl.includes('drive.google.com')) {
            const match = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match) {
                const driveId = match[1];
                if (driveNamesCache[driveId]) {
                    linkName = driveNamesCache[driveId];
                } else {
                    linkName = 'Loading...';
                    fetchDriveFileName(driveId);
                }
            }
        }

        return `<a href="${cleanUrl}" target="_blank" rel="noopener" class="playback-detail-value" style="font-size: 0.8125rem; color: var(--accent-color); text-decoration: none; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${linkName}">${linkName}</a>`;
    }).join('')}
                        ${session.urls.length > 3 ? `<span class="playback-detail-value" style="font-size: 0.8125rem; color: var(--text-muted);">+${session.urls.length - 3} more</span>` : ''}
                    </div>
                </div>
            ` : ''
        }
        </div>
    `).join('');

    playbackList.innerHTML = listHtml + renderPaginationControls(currentPlaybackPage, totalPages, 'playback');
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function updateDevicesView() {
    const devicesTable = document.getElementById('devices-table');
    const typeFilter = document.getElementById('device-type-filter');
    const statusFilter = document.getElementById('device-status-filter');

    // Filter devices
    const selectedType = typeFilter.value;
    const selectedStatus = statusFilter.value;

    const filteredDevices = Object.entries(usersData).filter(([deviceId, device]) => {
        // Search filter
        if (currentSearchQuery) {
            const searchLower = currentSearchQuery.toLowerCase();
            const matchesSearch =
                deviceId.toLowerCase().includes(searchLower) ||
                (device.deviceBrand && device.deviceBrand.toLowerCase().includes(searchLower)) ||
                (device.deviceModel && device.deviceModel.toLowerCase().includes(searchLower)) ||
                (device.ipAddress && device.ipAddress.includes(searchLower)) ||
                (device.wifiSsid && device.wifiSsid.toLowerCase().includes(searchLower));

            if (!matchesSearch) return false;
        }

        if (selectedType !== 'all' && device.deviceType !== selectedType) return false;
        if (selectedStatus === 'online' && !isDeviceOnline(device.lastSeen, deviceId)) return false;
        if (selectedStatus === 'offline' && isDeviceOnline(device.lastSeen, deviceId)) return false;
        return true;
    });

    if (filteredDevices.length === 0) {
        devicesTable.innerHTML = '<div class="empty-state"><p>No devices found</p></div>';
        return;
    }

    // Pagination Logic
    const totalPages = Math.ceil(filteredDevices.length / itemsPerPage);
    if (currentDevicesPage > totalPages) currentDevicesPage = 1;

    const startIndex = (currentDevicesPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedDevices = filteredDevices.slice(startIndex, endIndex);

    const tableHtml = `
        <div class="device-row header">
            <div>Device</div>
            <div>Specifications</div>
            <div>Network</div>
            <div>Storage & System</div>
            <div>Screen</div>
            <div>Status</div>
        </div>
        ${paginatedDevices.map(([deviceId, device]) => {
        // Use playback data for lastSeen if available
        const playbackSession = playbackData[deviceId];
        let lastSeen = device.lastSeen;

        if (playbackSession && playbackSession.lastSeen) {
            lastSeen = playbackSession.lastSeen;
        } else if (playbackSession && playbackSession.timestamp) {
            lastSeen = playbackSession.timestamp;
        }

        const online = isDeviceOnline(lastSeen, deviceId);
        const storage = device.storageFree ? formatBytes(device.storageFree) : 'N/A';
        const wifiInfo = device.networkType === 'WiFi' && device.wifiSsid && device.wifiSsid !== 'N/A'
            ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">SSID: ${device.wifiSsid.replace(/"/g, '')}</div>`
            : '';

        const resolution = (device.screenWidth && device.screenHeight)
            ? `${device.screenWidth}×${device.screenHeight}`
            : 'N/A';
        const density = device.screenDensity ? `${device.screenDensity} DPI` : 'N/A';

        return `
                <div class="device-row">
                    <div class="device-cell">
                        <span class="device-cell-label">Device ID</span>
                        <span class="device-cell-value" style="font-family: 'Courier New', monospace; font-size: 0.8125rem;">${deviceId}</span>
                        <span class="device-cell-value" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${device.timezone || ''}</span>
                    </div>
                    <div class="device-cell">
                        <span class="device-cell-label">${device.deviceType}</span>
                        <span class="device-cell-value">${device.deviceBrand} ${device.deviceModel}</span>
                        <span class="device-cell-value" style="font-size: 0.8125rem; color: var(--text-muted);">App v${device.appVersion || 'N/A'}</span>
                    </div>
                    <div class="device-cell">
                        <span class="device-cell-label">${device.networkType || 'N/A'}</span>
                        <span class="device-cell-value" style="font-size: 0.8125rem;">${device.ipAddress || 'N/A'}</span>
                        ${wifiInfo}
                    </div>
                    <div class="device-cell">
                        <span class="device-cell-label">Free Storage</span>
                        <span class="device-cell-value">${storage}</span>
                        <span class="device-cell-value" style="font-size: 0.8125rem; color: var(--text-muted);">Android ${device.androidVersion || 'N/A'} (API ${device.apiLevel || 'N/A'})</span>
                    </div>
                    <div class="device-cell">
                        <span class="device-cell-label">Resolution</span>
                        <span class="device-cell-value">${resolution}</span>
                        <span class="device-cell-value" style="font-size: 0.8125rem; color: var(--text-muted);">${density}</span>
                    </div>
                    <div class="device-cell">
                        <span class="device-status-indicator ${online ? 'online' : 'offline'}">
                            <span class="device-status-dot ${online ? 'online' : 'offline'}"></span>
                            ${online ? 'Online' : 'Offline'}
                        </span>
                        <span class="device-cell-value" style="font-size: 0.8125rem; color: var(--text-muted);">Seen: ${formatTimestamp(lastSeen)}</span>
                    </div>
                </div>
            `;
    }).join('')
        }
    `;

    devicesTable.innerHTML = tableHtml + renderPaginationControls(currentDevicesPage, totalPages, 'devices');
}

// Navigation
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });
}

function switchView(view) {
    currentView = view;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });

    // Update view content
    document.querySelectorAll('.view-content').forEach(content => {
        content.classList.toggle('active', content.id === `${view}-view`);
    });

    // Update header
    const titles = {
        overview: { title: 'Overview', subtitle: 'Real-time dashboard for Blue Tokai Coffee signage system' },
        branches: { title: 'Branches', subtitle: 'Manage cafe locations and menu configurations' },
        playback: { title: 'Active Playback', subtitle: 'Monitor content being displayed on devices' },
        devices: { title: 'Devices', subtitle: 'View and manage registered devices' }
    };

    document.getElementById('view-title').textContent = titles[view].title;
    document.getElementById('view-subtitle').textContent = titles[view].subtitle;

    // Update UI for the new view
    updateUI();
}

// Search functionality
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        console.log('Search input event:', e.target.value);
        currentSearchQuery = e.target.value ? String(e.target.value).trim() : '';
        console.log('Current search query set to:', currentSearchQuery);
        updateUI();
    });
}

// Filter functionality
function setupFilters() {
    const pricingFilter = document.getElementById('pricing-filter');
    const deviceTypeFilter = document.getElementById('device-type-filter');
    const deviceStatusFilter = document.getElementById('device-status-filter');

    pricingFilter.addEventListener('change', () => updateBranchesView());
    deviceTypeFilter.addEventListener('change', () => updateDevicesView());
    deviceStatusFilter.addEventListener('change', () => updateDevicesView());
}

// Initialize app
function init() {
    console.log('Initializing BTC DMB Dashboard...');

    setupNavigation();
    setupSearch();
    setupFilters();

    // Connect to Firebase with Authentication
    console.log('🔐 Authenticating with Firebase...');
    signInAnonymously(auth)
        .then(() => {
            console.log('✅ Signed in anonymously');
            setupFirebaseListeners();

            // Hide loading screen and show app
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('app').style.display = 'grid';
            }, 1000);
        })
        .catch((error) => {
            console.error('❌ Error signing in:', error);
            const loadingText = document.querySelector('#loading-screen p');
            if (loadingText) {
                loadingText.textContent = `Error: ${error.message}`;
                loadingText.style.color = 'var(--error)';
            }
        });
}

// Start the app
init();
