// options.js

// Default Settings
const defaults = {
    pdfdl: {
        enable: true
    },
    tracker: {
        enableSummaryAtDashboard: true,
        enableSummaryAtLecture: true,
        enableAssignmentDetail: true,
        showBody: true,
        showRemainingTime: true,
        urgentThresholdHours: 72
    },
    advanced: {
        fetchInterval: 100,
        cacheTtl: 60 * 1000, // 1 min
        cacheTtlSubmitted: 7 * 24 * 60 * 60 * 1000 // 1 week
    }
};

// UI Elements Map
const elements = {
    pdfdl: {
        enable: document.getElementById('pdfdl-enable')
    },
    tracker: {
        enableSummaryAtDashboard: document.getElementById('tracker-enableSummaryAtDashboard'),
        enableSummaryAtLecture: document.getElementById('tracker-enableSummaryAtLecture'),
        enableAssignmentDetail: document.getElementById('tracker-enableAssignmentDetail'),
        showBody: document.getElementById('tracker-showBody'),
        showRemainingTime: document.getElementById('tracker-showRemainingTime'),
        urgentThresholdHours: document.getElementById('tracker-urgentThresholdHours')
    },
    advanced: {
        fetchInterval: document.getElementById('advanced-fetchInterval'),
        cacheTtl: document.getElementById('advanced-cacheTtl'),
        cacheTtlSubmitted: document.getElementById('advanced-cacheTtlSubmitted')
    },
    saveBar: document.getElementById('save-bar'),
    saveBtn: document.getElementById('save-btn'),
    saveStatus: document.getElementById('save-status'),
    clearCacheBtn: document.getElementById('clear-cache-btn'),
    versionNumber: document.getElementById('version-number')
};

// Initialize Options Page
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    setupEventListeners();
    setVersion();
    loadPatchNotes();

    // Set Copyright Year
    const yearSpan = document.getElementById('copyright-year');
    if (yearSpan) {
        yearSpan.textContent = new Date().getFullYear();
    }
});

function setVersion() {
    const manifest = chrome.runtime.getManifest();
    if (elements.versionNumber) {
        elements.versionNumber.textContent = manifest.version;
    }
}

// Load settings from storage
function loadSettings() {
    chrome.storage.local.get(['options'], (result) => {
        const options = deepMerge(defaults, result.options || {});

        // Apply to UI
        elements.pdfdl.enable.checked = options.pdfdl.enable;

        elements.tracker.enableSummaryAtDashboard.checked = options.tracker.enableSummaryAtDashboard;
        elements.tracker.enableSummaryAtLecture.checked = options.tracker.enableSummaryAtLecture;
        elements.tracker.enableAssignmentDetail.checked = options.tracker.enableAssignmentDetail;
        elements.tracker.showBody.checked = options.tracker.showBody;
        elements.tracker.showRemainingTime.checked = options.tracker.showRemainingTime;
        elements.tracker.urgentThresholdHours.value = options.tracker.urgentThresholdHours;

        elements.advanced.fetchInterval.value = options.advanced.fetchInterval;
        elements.advanced.cacheTtl.value = options.advanced.cacheTtl;
        elements.advanced.cacheTtlSubmitted.value = options.advanced.cacheTtlSubmitted;

        // Update previews
        updateTimePreviews();
    });
}

// Collect settings from UI
function getSettingsFromUI() {
    return {
        pdfdl: {
            enable: elements.pdfdl.enable.checked
        },
        tracker: {
            enableSummaryAtDashboard: elements.tracker.enableSummaryAtDashboard.checked,
            enableSummaryAtLecture: elements.tracker.enableSummaryAtLecture.checked,
            enableAssignmentDetail: elements.tracker.enableAssignmentDetail.checked,
            showBody: elements.tracker.showBody.checked,
            showRemainingTime: elements.tracker.showRemainingTime.checked,
            urgentThresholdHours: parseInt(elements.tracker.urgentThresholdHours.value, 10)
        },
        advanced: {
            fetchInterval: Math.max(10, parseInt(elements.advanced.fetchInterval.value, 10) || 100),
            cacheTtl: parseInt(elements.advanced.cacheTtl.value, 10),
            cacheTtlSubmitted: parseInt(elements.advanced.cacheTtlSubmitted.value, 10)
        }
    };
}

// Save settings to storage
function saveSettings() {
    const options = getSettingsFromUI();

    chrome.storage.local.set({ options }, () => {
        showSaveStatus();
    });
}

// Helper: Deep Merge
function deepMerge(target, source) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = deepMerge(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

// UI Helpers
function setupEventListeners() {
    // Tab Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update Nav
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update Content
            const tabId = item.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });

    // Detect Changes to show Save Bar
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            elements.saveBar.classList.add('visible');
            elements.saveBar.classList.remove('saved'); // Reset to "Changes detected"
            elements.saveBtn.disabled = false;
            updateTimePreviews();
        });
        if (input.type === 'number') {
            input.addEventListener('input', () => {
                elements.saveBar.classList.add('visible');
                elements.saveBar.classList.remove('saved');
                elements.saveBtn.disabled = false;
                updateTimePreviews();
            });
        }
    });

    // Save Button
    elements.saveBtn.addEventListener('click', saveSettings);

    // Clear Cache Button
    if (elements.clearCacheBtn) {
        elements.clearCacheBtn.addEventListener('click', clearCache);
    }
}

function clearCache() {
    if (!confirm('정말 모든 캐시 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
        return;
    }

    chrome.storage.local.get(null, (items) => {
        const keysToRemove = Object.keys(items).filter(key => key !== 'options');

        if (keysToRemove.length === 0) {
            alert('삭제할 캐시 데이터가 없습니다.');
            return;
        }

        chrome.storage.local.remove(keysToRemove, () => {
            alert('캐시 데이터가 성공적으로 삭제되었습니다.');
            // Optional: visual feedback
        });
    });
}

// Show save feedback
function saveSettings() {
    elements.saveBtn.disabled = true;
    const options = getSettingsFromUI();

    chrome.storage.local.set({ options }, () => {
        showSaveStatus();
    });
}

function showSaveStatus() {
    // Instant hide without animation
    elements.saveBar.style.transition = 'none';
    elements.saveBar.classList.remove('visible');

    // Reset state immediately (next tick)
    setTimeout(() => {
        elements.saveBar.classList.remove('saved');
        elements.saveBtn.disabled = false;
        // Restore transition for next appearance
        elements.saveBar.style.transition = '';
    }, 50);
}

// Time Conversion Helper
function msToNaturalLanguage(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (weeks > 0) return `${weeks}주 (${days}일)`;
    if (days > 0) return `${days}일`;
    if (hours > 0) return `${hours}시간`;
    if (minutes > 0) return `${minutes}분`;
    return `${seconds}초`;
}

function updateTimePreviews() {
    const ttl = parseInt(elements.advanced.cacheTtl.value, 10) || 0;
    const ttlSub = parseInt(elements.advanced.cacheTtlSubmitted.value, 10) || 0;

    const preview1 = document.getElementById('advanced-cacheTtl-preview');
    const preview2 = document.getElementById('advanced-cacheTtlSubmitted-preview');

    if (preview1) preview1.textContent = `≈ ${msToNaturalLanguage(ttl)}`;
    if (preview2) preview2.textContent = `≈ ${msToNaturalLanguage(ttlSub)}`;
}

// Load Patch Notes
async function loadPatchNotes() {
    const listContainer = document.getElementById('patch-notes-list');
    if (!listContainer) return;

    try {
        const response = await fetch('patch_notes.json');
        const notes = await response.json();

        let html = '';
        notes.forEach(note => {
            const changesHtml = note.changes.map(change => `<li>${change}</li>`).join('');

            html += `
                <div class="patch-note-item">
                    <div class="patch-header">
                        <span class="patch-version">${note.version}</span>
                        <span class="patch-date">${note.date}</span>
                    </div>
                    <div class="patch-body">
                        <p class="patch-summary">${note.summary}</p>
                        <ul class="patch-changes">
                            ${changesHtml}
                        </ul>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    } catch (error) {
        // console.error('Failed to load patch notes:', error);
        listContainer.innerHTML = '<p class="error">패치 노트를 불러올 수 없습니다.</p>';
    }
}
