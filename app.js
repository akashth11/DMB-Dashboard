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

// Loading States
let isBranchesLoading = true;
let isPlaybackLoading = true;
let isUsersLoading = true;




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
        // Artificial delay to show loading spinner
        setTimeout(() => {
            isBranchesLoading = false;
            branchesData = snapshot.val() || {};
            console.log('📍 Branches data received:', Object.keys(branchesData).length, 'branches');
            window.branchesData = branchesData;
            prefetchDriveFilenames(branchesData);
            updateUI();
        }, 800);
    });

    // Playback listener
    const playbackRef = ref(database, 'playback');
    onValue(playbackRef, (snapshot) => {
        setTimeout(() => {
            isPlaybackLoading = false;
            playbackData = snapshot.val() || {};
            console.log('▶️ Playback data received:', Object.keys(playbackData).length, 'sessions');
            window.playbackData = playbackData;
            updateUI();
        }, 800);
    });

    // Users listener
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
        setTimeout(() => {
            isUsersLoading = false;
            usersData = snapshot.val() || {};
            console.log('📱 Users data received:', Object.keys(usersData).length, 'devices');
            window.usersData = usersData;
            updateUI();
        }, 800);
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

// Counter Animation
function animateCounter(element, targetValue, duration = 800) {
    const startValue = parseInt(element.textContent) || 0;
    const difference = targetValue - startValue;

    if (difference === 0) return; // No change, skip animation

    const startTime = performance.now();

    function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function for smooth animation (easeOutCubic)
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentValue = Math.round(startValue + (difference * easeProgress));
        element.textContent = currentValue;

        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent = targetValue; // Ensure final value is exact
        }
    }

    requestAnimationFrame(updateCounter);
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

    const turnedOffCount = Object.values(playbackData).filter(session => {
        const lastActive = session.lastSeen || session.timestamp;
        if (!lastActive) return false;
        // 45 minutes in milliseconds
        const TURNED_OFF_THRESHOLD = 45 * 60 * 1000;
        return (now - lastActive) > TURNED_OFF_THRESHOLD;
    }).length;

    // Animate the counter updates
    animateCounter(document.getElementById('stat-branches'), branchCount);
    animateCounter(document.getElementById('stat-devices'), deviceCount);
    animateCounter(document.getElementById('stat-playback'), playbackCount);
    animateCounter(document.getElementById('stat-turned-off'), turnedOffCount);

    // Update recent activity
    updateRecentActivity();
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

    // Playback Filters
    document.getElementById('playback-status-filter').addEventListener('change', updatePlaybackView);
    document.getElementById('playback-category-filter').addEventListener('change', updatePlaybackView);

    // Device Filtersivities
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

    if (isBranchesLoading) {
        branchesGrid.innerHTML = `
            <div style="display: flex; justify-content: center; padding: 3rem; width: 100%; grid-column: 1 / -1;">
                <div class="loading-spinner"></div>
            </div>
        `;
        return;
    }

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
        // Filter out invalid entries (e.g. metadata)
        if (!branch || typeof branch !== 'object' || !branch.branchName) return false;

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
    }).map(([code, branch]) => ({ ...branch, branchCode: code })); // Convert to array of objects with code

    if (filteredBranches.length === 0) {
        branchesGrid.innerHTML = '<div class="empty-state"><p>No branches found</p></div>';
        return;
    }

    // Generate HTML for branches
    branchesGrid.innerHTML = filteredBranches.map(branch => {
        // Determine pricing class
        let pricingClass = 'pricing-not-found';
        if (branch.pricingVersion) {
            const version = branch.pricingVersion.toLowerCase();
            if (version.includes('regular')) pricingClass = 'pricing-regular';
            else if (version.includes('premium version 2')) pricingClass = 'pricing-premium-2';
            else if (version.includes('premium')) pricingClass = 'pricing-premium';
        }

        // Helper to create link row
        const createLinkRow = (label, url, iconPath) => {
            const hasUrl = url && url !== '#';
            const cleanUrl = hasUrl ? url.trim() : '#';
            let linkName = hasUrl ? getLinkName(cleanUrl) : 'Not Configured';

            // Handle Drive links for name fetching
            if (hasUrl && cleanUrl.includes('drive.google.com')) {
                const match = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
                if (match) {
                    const driveId = match[1];
                    if (driveNamesCache[driveId]) {
                        linkName = driveNamesCache[driveId];
                    } else {
                        fetchDriveFileName(driveId);
                    }
                }
            }

            return `
                <a href="${cleanUrl}" target="_blank" class="content-link-row ${!hasUrl ? 'empty' : ''}" ${!hasUrl ? 'onclick="return false;"' : ''}>
                    <div class="link-info">
                        <div class="link-icon">
                            ${iconPath}
                        </div>
                        <div class="link-details">
                            <span class="link-label">${label}</span>
                            <span class="link-name" title="${linkName}">${linkName}</span>
                        </div>
                    </div>
                    ${hasUrl ? `
                    <div class="link-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </div>` : ''}
                </a>
            `;
        };

        // Icons
        const beverageIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
        const foodIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>`;
        const retailIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`;
        const contentIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;

        return `
            <div class="branch-card ${pricingClass}">
                <div class="branch-card-header">
                    <div class="branch-info">
                        <h3>${branch.branchName}</h3>
                        <span class="branch-code">${branch.branchCode}</span>
                    </div>
                    <span class="pricing-badge">${branch.pricingVersion || 'Not Found'}</span>
                </div>
                <div class="branch-card-body">
                    <div class="content-group">
                        ${createLinkRow('Beverage Menu', branch.beverage, beverageIcon)}
                        ${createLinkRow('Food Menu', branch.food, foodIcon)}
                        ${createLinkRow('Retail', branch.retail, retailIcon)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}



function updatePlaybackView() {
    const playbackList = document.getElementById('playback-list');

    if (isPlaybackLoading) {
        playbackList.innerHTML = `
            <div style="display: flex; justify-content: center; padding: 3rem;">
                <div class="loading-spinner"></div>
            </div>
            `;
        return;
    }

    const statusFilter = document.getElementById('playback-status-filter').value;
    const categoryFilter = document.getElementById('playback-category-filter').value;

    // 1. First apply Search and Category filters to get the "Context"
    const contextSessions = Object.entries(playbackData).filter(([deviceId, session]) => {
        // Category Filter
        if (categoryFilter !== 'all') {
            if (!session.category || session.category.toLowerCase() !== categoryFilter) return false;
        }

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

    // 3. Finally apply Status Filter for the list display
    const playbackSessions = contextSessions.filter(([deviceId, session]) => {
        const isTurnedOff = isDeviceTurnedOff(session);

        // Status Filter
        if (statusFilter === 'online' && isTurnedOff) return false;
        if (statusFilter === 'offline' && !isTurnedOff) return false;

        return true;
    });

    // 4. Calculate Counts based on the FINAL list
    let totalActive = 0;
    let totalTurnedOff = 0;

    playbackSessions.forEach(([_, session]) => {
        if (isDeviceTurnedOff(session)) {
            totalTurnedOff++;
        } else {
            totalActive++;
        }
    });

    // Clear list initially
    playbackList.innerHTML = '';

    // Update Count Elements immediately
    const activeCountEl = document.getElementById('playback-count-active');
    const offlineCountEl = document.getElementById('playback-count-offline');
    if (activeCountEl) activeCountEl.textContent = totalActive;
    if (offlineCountEl) offlineCountEl.textContent = totalTurnedOff;

    if (playbackSessions.length === 0) {
        playbackList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"/>
                </svg>
                <h3>No Playback Sessions Found</h3>
                <p>Try adjusting your filters or search query</p>
            </div>
            `;
        return;
    }

    // Chunked Rendering to prevent main thread blocking
    window.currentPlaybackRenderId = (window.currentPlaybackRenderId || 0) + 1;
    const myRenderId = window.currentPlaybackRenderId;

    let currentIndex = 0;
    const CHUNK_SIZE = 20;

    function renderChunk() {
        // If a new render has started, stop this one
        if (myRenderId !== window.currentPlaybackRenderId) return;

        const chunk = playbackSessions.slice(currentIndex, currentIndex + CHUNK_SIZE);
        if (chunk.length === 0) return;

        const chunkHtml = chunk.map(([deviceId, session]) => {
            const lastSeen = session.lastSeen || session.timestamp;
            const isOnline = lastSeen && (Date.now() - lastSeen) < (30 * 60 * 1000);

            // Determine display status based on online state
            const isTurnedOff = isDeviceTurnedOff(session);
            const displayStatus = isTurnedOff ? 'Turned Off' : (session.status || 'active');
            const statusClass = isTurnedOff ? 'offline' : (session.status || 'active');

            return `
            <div class="playback-card" onclick="showDeviceDetails('${deviceId}')" style="cursor: pointer;">
            <div class="playback-header">
                <div class="playback-device">
                    <h4>${session.branchName}</h4>
                    <span class="device-id">${deviceId}</span>
                </div>
                <div class="playback-status">
                    <span class="status-badge ${statusClass}">${displayStatus}</span>
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
                            fetchDriveFileName(driveId);
                        }
                    }
                }

                return `<a href="${cleanUrl}" target="_blank" class="content-link" onclick="event.stopPropagation()">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                </svg>
                                ${linkName}
                            </a>`;
            }).join('')}
                        ${session.urls.length > 3 ? `<span style="font-size: 0.75rem; color: var(--text-muted);">+${session.urls.length - 3} more...</span>` : ''}
                    </div>
                </div>
            ` : ''
                }
        </div>
            `;
        }).join('');

        playbackList.insertAdjacentHTML('beforeend', chunkHtml);
        currentIndex += CHUNK_SIZE;

        if (currentIndex < playbackSessions.length) {
            requestAnimationFrame(renderChunk);
        }
    }

    // Start rendering
    renderChunk();
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]} `;
}

function updateDevicesView() {
    const devicesTable = document.getElementById('devices-table');

    if (isUsersLoading) {
        devicesTable.innerHTML = `
            <div style="display: flex; justify-content: center; padding: 3rem;">
                <div class="loading-spinner"></div>
            </div>
            `;
        return;
    }

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

    const tableHtml = `
        <div class="device-row header">
            <div>Device</div>
            <div>Specifications</div>
            <div>Network</div>
            <div>Storage & System</div>
            <div>Screen</div>
            <div>Status</div>
        </div>
            ${filteredDevices.map(([deviceId, device]) => {
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

    devicesTable.innerHTML = tableHtml;
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
        playback: {
            title: 'Active Playback',
            subtitle: 'Monitor content being displayed on devices'
        },
        devices: { title: 'Devices', subtitle: 'View and manage registered devices' }
    };

    document.getElementById('view-title').textContent = titles[view].title;
    document.getElementById('view-subtitle').textContent = titles[view].subtitle;

    // Show/hide search box based on view
    const searchBox = document.querySelector('.search-box');
    if (searchBox) {
        if (view === 'overview') {
            searchBox.style.display = 'none';
        } else {
            searchBox.style.display = 'flex';
        }
    }

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

// Theme Management
function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    const htmlElement = document.documentElement;

    if (theme === 'system') {
        const systemTheme = getSystemTheme();
        htmlElement.setAttribute('data-theme', systemTheme);
    } else {
        htmlElement.setAttribute('data-theme', theme);
    }

    // Update active button
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.theme === theme) {
            btn.classList.add('active');
        }
    });

    // Save preference
    localStorage.setItem('theme-preference', theme);
}

function setupThemeToggle() {
    const themeButtons = document.querySelectorAll('.theme-btn');

    // Load saved theme or default to system
    const savedTheme = localStorage.getItem('theme-preference') || 'system';
    applyTheme(savedTheme);

    // Add click handlers
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            applyTheme(theme);
        });
    });

    // Listen for system theme changes when in system mode
    const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeQuery.addEventListener('change', () => {
        const currentPreference = localStorage.getItem('theme-preference');
        if (currentPreference === 'system') {
            applyTheme('system');
        }
    });
}

// Sidebar toggle functionality
function setupSidebarToggle() {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (!hamburgerBtn || !sidebar || !overlay) return;

    // Toggle sidebar on hamburger click
    hamburgerBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
    });

    // Close sidebar when clicking overlay
    overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    });

    // Close sidebar when clicking a nav item (on mobile)
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });
}

// Stat Card Click Handlers
function setupStatCardClicks() {
    const statCards = document.querySelectorAll('.clickable-stat');

    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const action = card.dataset.action;

            if (action === 'show-turned-off') {
                // Switch to playback view and set filter to offline
                switchView('playback');
                // Wait for view switch then set filter
                setTimeout(() => {
                    const statusFilter = document.getElementById('playback-status-filter');
                    if (statusFilter) {
                        statusFilter.value = 'offline';
                        updatePlaybackView();
                    }
                }, 100);
            }
        });
    });
}

// Initialize app
function init() {
    console.log('Initializing BTC DMB Dashboard...');

    setupNavigation();
    setupSearch();
    setupFilters();

    setupSidebarToggle();
    setupThemeToggle();
    setupStatCardClicks();

    // Set initial search box visibility (hide on overview)
    const searchBox = document.querySelector('.search-box');
    if (searchBox && currentView === 'overview') {
        searchBox.style.display = 'none';
    }

    // Connect to Firebase with Authentication
    console.log('🔐 Authenticating with Firebase...');
    signInAnonymously(auth)
        .then(() => {
            console.log('✅ Signed in anonymously');
            console.log('✅ Signed in anonymously');
            setupFirebaseListeners();
            updateUI(); // Render initial loading state

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
                loadingText.textContent = `Error: ${error.message} `;
                loadingText.style.color = 'var(--error)';
            }
        });
}

// Start the app
init();

// Helper to check if device is turned off
function isDeviceTurnedOff(session) {
    const lastActive = session.lastSeen || session.timestamp;
    if (!lastActive) return true; // If no time, assume turned off? Or active? User said "if last seen not present the timestamp value should be more than 45 minutes"
    const now = Date.now();
    const TURNED_OFF_THRESHOLD = 45 * 60 * 1000; // 45 minutes
    return (now - lastActive) > TURNED_OFF_THRESHOLD;
}

// Modal Functions
window.showDeviceDetails = function (deviceId) {
    const session = playbackData[deviceId];
    const user = usersData[deviceId] || {};
    const modal = document.getElementById('device-modal');
    const modalBody = document.getElementById('modal-body');

    if (!session) return;

    const lastSeen = session.lastSeen || session.timestamp;
    // Use the same 45 min threshold for "Online Status" consistency, or keep 30? 
    // User said "online status is correct" (Offline). 
    // Let's use the isDeviceTurnedOff logic to determine the main Status.

    const isTurnedOff = isDeviceTurnedOff(session);
    const displayStatus = isTurnedOff ? 'Turned Off' : (session.status || 'active');
    const statusClass = isTurnedOff ? 'offline' : (session.status || 'active'); // Use 'offline' class for red/gray styling

    // For Online Status row, we can keep the existing logic or align it.
    // Let's align it to the "Turned Off" concept for consistency.
    const isOnline = !isTurnedOff;

    modalBody.innerHTML = `
        <div class="modal-section">
            <h3 class="modal-section-title">Device Information</h3>
            <div class="modal-grid">
                <div class="detail-item">
                    <span class="detail-label">Device ID</span>
                    <span class="detail-value code">${deviceId}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Branch Name</span>
                    <span class="detail-value">${session.branchName || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Status</span>
                    <span class="detail-value">
                        <span class="status-badge ${statusClass}">${displayStatus}</span>
                    </span>
                </div>
                 <div class="detail-item">
                    <span class="detail-label">Online Status</span>
                    <span class="detail-value" style="color: ${isOnline ? 'var(--success)' : 'var(--error)'}">
                        ${isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
            </div>
        </div >

        <div class="modal-section">
            <div class="modal-section-title">Technical Details</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">App Version</span>
                    <span class="detail-value">${session.appVersion || user.appVersion || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Android Version</span>
                    <span class="detail-value">${user.androidVersion || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Device Model</span>
                    <span class="detail-value">${user.deviceModel || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Device Brand</span>
                    <span class="detail-value">${user.deviceBrand || 'N/A'}</span>
                </div>
                 <div class="detail-item">
                    <span class="detail-label">IP Address</span>
                    <span class="detail-value">${user.ipAddress || 'N/A'}</span>
                </div>
                 <div class="detail-item">
                    <span class="detail-label">WiFi SSID</span>
                    <span class="detail-value">${user.wifiSsid || 'N/A'}</span>
                </div>
                 <div class="detail-item">
                    <span class="detail-label">Storage Free</span>
                    <span class="detail-value">${user.storageFree ? formatBytes(user.storageFree) : 'N/A'}</span>
                </div>
            </div>
        </div>

         <div class="modal-section">
            <div class="modal-section-title">Timestamps</div>
            <div class="detail-grid">
                <div class="detail-item">
                    <span class="detail-label">Last Seen</span>
                    <span class="detail-value">${formatTimestamp(lastSeen)}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Started At</span>
                    <span class="detail-value">${formatTimestamp(session.timestamp)}</span>
                </div>
                 <div class="detail-item">
                    <span class="detail-label">Created At</span>
                    <span class="detail-value">${formatTimestamp(user.createdAt)}</span>
                </div>
            </div>
        </div>
        `;

    modal.classList.add('active');
};

window.closeModal = function () {
    const modal = document.getElementById('device-modal');
    modal.classList.remove('active');
};

// Close modal on outside click
const deviceModal = document.getElementById('device-modal');
if (deviceModal) {
    deviceModal.addEventListener('click', (e) => {
        if (e.target.id === 'device-modal') {
            closeModal();
        }
    });
}
