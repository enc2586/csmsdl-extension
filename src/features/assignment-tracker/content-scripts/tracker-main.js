// tracker-main.js
(function () {
    'use strict';

    // Global Namespace
    window.GistAssignmentTracker = window.GistAssignmentTracker || {};

    const { Utils, Api, UI, Dashboard, Config } = window.GistAssignmentTracker;

    // Track active containers
    const assignmentContainers = new Map(); // id -> Array<{ container, data, url, isInOverview }>

    // Current Options
    let CurrentOptions = {
        tracker: {
            enableSummaryAtDashboard: true,
            enableSummaryAtLecture: true,
            enableAssignmentDetail: true,
            showBody: true,
            showRemainingTime: true,
            urgentThresholdHours: 72
        },
        advanced: {
            cacheTtl: 60000,
            cacheTtlSubmitted: 604800000
        }
    };

    // Helper to render all containers for an ID
    function renderAllContainers(id, data, error = null) {
        // Check if detail view is enabled
        if (!CurrentOptions.tracker.enableAssignmentDetail) return;

        const containers = assignmentContainers.get(id);
        if (!containers) return;

        containers.forEach(info => {
            // Update local data reference
            info.data = data;
            UI.renderAssignmentInfo(info.container, data, error, info.url, info.isInOverview, CurrentOptions.tracker);
        });
    }

    function handleAssignmentLink(link) {
        const href = link.href;
        const url = new URL(href);
        const id = url.searchParams.get('id');

        if (!id) return;
        if (link.dataset.trackerProcessed) return;
        link.dataset.trackerProcessed = 'true';

        // Get Title
        let title = link.textContent.trim();
        const hiddenSpan = link.querySelector('.accesshide');
        if (hiddenSpan) {
            const clone = link.cloneNode(true);
            const hide = clone.querySelector('.accesshide');
            if (hide) hide.remove();
            title = clone.textContent.trim();
        }

        // Register to Dashboard
        Dashboard.registerAssignment(id, href, title);

        // Check if chips are enabled
        if (CurrentOptions.tracker.enableAssignmentDetail) {
            // Create UI container
            const infoContainer = UI.createAssignmentInfoElement();

            // Check if in overview
            const isInOverview = link.closest('#section-0') !== null;

            // Add to containers map
            if (!assignmentContainers.has(id)) {
                assignmentContainers.set(id, []);
            }
            assignmentContainers.get(id).push({ container: infoContainer, data: null, url: href, isInOverview });

            // Position Container
            const activityInstance = link.closest('.activityinstance');
            if (activityInstance) {
                activityInstance.appendChild(infoContainer);
            } else {
                link.parentElement.appendChild(infoContainer);
            }

            // Initial Loading Render (for this specific container only)
            UI.renderAssignmentInfo(infoContainer, null, null, href, isInOverview, CurrentOptions.tracker);
        }

        // Handler for data updates
        const handleDataUpdate = (data, error = null) => {
            renderAllContainers(id, data, error);
            // Always notify dashboard even if data is null (error), so it counts as "loaded"
            Dashboard.updateAssignmentData(id, data);
        };



        // Check internal Dashboard state first (optimization)
        const dashboardData = Dashboard.state.assignments[id];
        // If dashboard has data (deadline is not null implies we fetched it), use it.
        // But dashboard init is empty. We need to check if we have *fetched* data.
        // Dashboard state init: deadline: null.
        if (dashboardData && dashboardData.deadline !== null) {
            handleDataUpdate(dashboardData);
            return;
        }

        // Check Cache
        const cacheKey = `assignment_${id} `;
        chrome.storage.local.get([cacheKey], (result) => {
            const cached = result[cacheKey];
            const now = Date.now();
            let isValid = false;

            if (cached) {
                const ttl = cached.isSubmitted ? CurrentOptions.advanced.cacheTtlSubmitted : CurrentOptions.advanced.cacheTtl;
                if (now - cached.timestamp < ttl) {
                    isValid = true;
                }
            }

            if (isValid) {
                handleDataUpdate(cached);
            } else {
                // Determine if we should fetch. 
                // If another link for this ID is already fetching, we might duplicate work here.
                // But the Queue system handles rate limiting.
                // We should ideally debounce fetches or check if a fetch is pending for this ID.
                // For now, let's just queue it. 

                const courseId = new URLSearchParams(window.location.search).get('id');

                Utils.enqueueFetch(async () => {
                    const data = await Api.fetchAssignmentDetails(href, id, href, courseId);
                    if (data) {
                        handleDataUpdate(data);
                        chrome.storage.local.set({ [cacheKey]: data });
                    } else {
                        handleDataUpdate(null, true);
                    }
                });
            }
        });
    }

    // Listen for settings changes via Storage
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.options) {
            const newOptions = changes.options.newValue || {};
            const trackerOpts = newOptions.tracker || {};
            const advancedOpts = newOptions.advanced || {};

            // Update Global state
            CurrentOptions = {
                tracker: { ...CurrentOptions.tracker, ...trackerOpts },
                advanced: { ...CurrentOptions.advanced, ...advancedOpts }
            };

            // Update Dashboard Config
            Dashboard.updateConfig(CurrentOptions.tracker);

            // Re-render UI Chips if detail enabled
            if (CurrentOptions.tracker.enableAssignmentDetail) {
                assignmentContainers.forEach((containers, id) => {
                    // Start missing containers if they were disabled before
                    // (Not easily possible with current logic as we only appended elements on load. 
                    //  If enabled->disabled->enabled, we might need to re-append. 
                    //  For now, assume page reload for major toggle changes is acceptable or 
                    //  just hiding them via CSS? But we removed them if disabled.)
                    // Actually, if we want to support dynamic toggle of enableAssignmentDetail,
                    // we need to create elements if they don't exist.
                    // But init only runs once. Simple re-render is fine for "update style",
                    // but "enable/disable" entire feature usually requires reload or complex logic.
                    // For now, simple re-render of content.

                    containers.forEach(({ container, data, url, isInOverview }) => {
                        if (container.isConnected) {
                            UI.renderAssignmentInfo(container, data, null, url, isInOverview, CurrentOptions.tracker);
                        }
                    });
                });
            } else {
                // If disabled dynamically, remove contents or hide
                assignmentContainers.forEach(containers => {
                    containers.forEach(({ container }) => {
                        container.innerHTML = '';
                    });
                });
            }
        }
    });

    async function init() {
        // Load Options
        const result = await chrome.storage.local.get(['options']);
        if (result.options) {
            const opts = result.options;
            if (opts.tracker) CurrentOptions.tracker = { ...CurrentOptions.tracker, ...opts.tracker };
            if (opts.advanced) CurrentOptions.advanced = { ...CurrentOptions.advanced, ...opts.advanced };
        }

        // Init Dashboard with options
        Dashboard.init(CurrentOptions.tracker);

        const links = document.querySelectorAll('a[href*="mod/assign/view.php?id="]');
        console.log(`[Tracker] Found ${links.length} assignment links`);

        links.forEach(link => {
            if (link.closest('.activity.assign') || link.closest('.modtype_assign')) {
                handleAssignmentLink(link);
            } else {
                handleAssignmentLink(link);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
