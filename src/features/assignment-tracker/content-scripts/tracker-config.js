// tracker-config.js
(function () {
    'use strict';

    window.GistAssignmentTracker = window.GistAssignmentTracker || {};

    // Configuration
    window.GistAssignmentTracker.Config = {
        FETCH_INTERVAL: 200, // 200ms between requests
        CACHE_TTL_DEFAULT: 60 * 1000, // 1 minute
        CACHE_TTL_SUBMITTED: 7 * 24 * 60 * 60 * 1000, // 1 week
        DASHBOAD_DEBOUNCE_MS: 500
    };

    // Feather Icons (SVGs)
    window.GistAssignmentTracker.Icons = {
        clock: `<svg viewBox="0 0 24 24" class="assignment-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
        check: `<svg viewBox="0 0 24 24" class="assignment-icon"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
        xCircle: `<svg viewBox="0 0 24 24" class="assignment-icon"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
    };

})();
