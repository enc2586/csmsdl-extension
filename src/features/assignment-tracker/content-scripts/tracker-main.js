// tracker-main.js
(function () {
    'use strict';

    // Global Namespace
    window.GistAssignmentTracker = window.GistAssignmentTracker || {};

    const { Utils, Api, UI, Dashboard, Config } = window.GistAssignmentTracker;

    // Track active containers
    const assignmentContainers = new Map(); // id -> Array<{ container, data, url, isInOverview }>

    // Helper to render all containers for an ID
    function renderAllContainers(id, data, error = null) {
        const containers = assignmentContainers.get(id);
        if (!containers) return;

        containers.forEach(info => {
            // Update local data reference
            info.data = data;
            UI.renderAssignmentInfo(info.container, data, error, info.url, info.isInOverview);
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

        // Handler for data updates
        const handleDataUpdate = (data, error = null) => {
            renderAllContainers(id, data, error);
            if (data) {
                Dashboard.updateAssignmentData(id, data);
            }
        };

        // Initial Loading Render (for this specific container only)
        UI.renderAssignmentInfo(infoContainer, null, null, href, isInOverview);

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
        const cacheKey = `assignment_${id}`;
        chrome.storage.local.get([cacheKey], (result) => {
            const cached = result[cacheKey];
            const now = Date.now();
            let isValid = false;

            if (cached) {
                const ttl = cached.isSubmitted ? Config.CACHE_TTL_SUBMITTED : Config.CACHE_TTL_DEFAULT;
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

    // Listen for settings changes to re-render UI
    window.addEventListener('GistAssignmentTracker:SettingsChanged', (e) => {
        // Re-render all registered containers
        assignmentContainers.forEach(containers => {
            containers.forEach(({ container, data, url, isInOverview }) => {
                if (data) {
                    UI.renderAssignmentInfo(container, data, null, url, isInOverview);
                }
            });
        });
    });

    function init() {
        Dashboard.init();

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
