// Course List Parser and Assignment Statistics for GIST LMS
// Parses course list and displays assignment statistics on main page

(function () {
    'use strict';

    // console.log('Course List Parser with Assignment Stats loaded');

    // Check if we're on the main page
    if (window.location.pathname !== '/' && !window.location.pathname.includes('index.php')) {
        return;
    }

    // Configuration (Defaults)
    const DEFAULT_CONFIG = {
        FETCH_INTERVAL: 100,
        CACHE_TTL_DEFAULT: 60 * 1000,
        CACHE_TTL_SUBMITTED: 7 * 24 * 60 * 60 * 1000,
        URGENT_THRESHOLD_HOURS: 72
    };

    let CurrentConfig = { ...DEFAULT_CONFIG };

    // Queue system for rate limiting (Promisified)
    const fetchQueue = [];
    let isProcessingQueue = false;

    async function processQueue() {
        if (fetchQueue.length === 0) {
            isProcessingQueue = false;
            return;
        }

        isProcessingQueue = true;
        const { fn, resolve, reject } = fetchQueue.shift();

        try {
            const result = await fn();
            resolve(result);
        } catch (e) {
            // console.error('Queue task error:', e);
            reject(e);
        }

        // Wait for FETCH_INTERVAL before processing next task
        setTimeout(processQueue, CurrentConfig.FETCH_INTERVAL);
    }

    function enqueueFetch(fn) {
        return new Promise((resolve, reject) => {
            fetchQueue.push({ fn, resolve, reject });
            if (!isProcessingQueue) {
                processQueue();
            }
        });
    }

    // Helper: Parse Date string (reused from assignment-tracker.js)
    function parseDate(dateStr) {
        if (!dateStr) return null;
        try {
            let matches = dateStr.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})/);
            if (matches) {
                return new Date(matches[1], matches[2] - 1, matches[3], matches[4], matches[5]);
            }

            matches = dateStr.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*(\d{1,2}):(\d{1,2})/);
            if (matches) {
                return new Date(matches[1], matches[2] - 1, matches[3], matches[4], matches[5]);
            }

            return null;
        } catch (e) {
            // console.error('Date parsing error:', e);
            return null;

        }
    }

    // Fetch Assignment Details (Scraper Logic)
    async function fetchAssignmentDetails(url, id, courseId) {
        try {
            const response = await fetch(url, { credentials: 'include' });
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Scraper logic reused from assignment-tracker.js
            const getValueByHeader = (headerText) => {
                const summaryTable = doc.querySelector('.submissionsummarytable');
                if (summaryTable) {
                    const cells = Array.from(summaryTable.querySelectorAll('th, td.cell.c0, td.c0'));
                    const targetCell = cells.find(cell => cell.textContent.includes(headerText));
                    if (targetCell) {
                        const row = targetCell.closest('tr');
                        if (row) {
                            const valueCell = row.querySelector('td.cell.c1, td.c1, td:not(.c0):not(.cell)');
                            if (valueCell) return valueCell.textContent.trim();
                            const nextTd = targetCell.nextElementSibling;
                            if (nextTd && nextTd.tagName === 'TD') return nextTd.textContent.trim();
                        }
                    }
                }
                let ths = Array.from(doc.querySelectorAll('th'));
                let targetTh = ths.find(th => th.textContent.includes(headerText));
                if (targetTh) {
                    const row = targetTh.closest('tr');
                    if (row) {
                        const td = row.querySelector('td');
                        if (td) return td.textContent.trim();
                    }
                }
                return null;
            };

            const submissionStatus = getValueByHeader('제출 여부');
            const dueDate = getValueByHeader('종료 일시');
            const noSubmissionRequired = submissionStatus && submissionStatus.includes('온라인 제출물을 요구하지 않습니다');

            let isSubmitted;
            if (noSubmissionRequired) {
                const parsedDueDate = parseDate(dueDate);
                if (parsedDueDate) {
                    isSubmitted = new Date() > parsedDueDate;
                } else {
                    isSubmitted = false;
                }
            } else {
                isSubmitted = submissionStatus && (submissionStatus.includes('제출함') || submissionStatus.includes('제출 완료'));
            }

            const titleElement = doc.querySelector('#region-main > div > h2');
            const assignmentTitle = titleElement ? titleElement.textContent.trim() : '';

            // Content scraping is not strictly needed for stats, but helpful for cache consistency
            // Simplified content scraping
            let assignmentContent = '';
            const contentElement = doc.querySelector('#intro, .box.generalbox.boxaligncenter, [id*="intro"]');
            if (contentElement) {
                assignmentContent = contentElement.textContent.trim().substring(0, 200);
            }

            // console.log(`[Parser] Fetched Details for ${id}: ${assignmentTitle}, Due: ${dueDate}, Submitted: ${isSubmitted}`);

            return {
                id,
                courseId,
                title: assignmentTitle,
                content: assignmentContent,
                deadline: dueDate, // Keep as string
                isSubmitted,
                timestamp: Date.now()
            };
        } catch (e) {
            // console.error(`Error fetching assignment details ${id}:`, e);
            return null;
        }
    }

    // Fetch course page and extract assignment links
    async function fetchCourseAssignments(courseId) {
        try {
            const url = `https://lms.gist.ac.kr/course/view.php?id=${courseId}`;
            const response = await fetch(url, { credentials: 'include' });
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Find all assignment links
            const assignments = [];
            const assignmentIds = new Set(); // Use Set to avoid duplicates
            const links = doc.querySelectorAll('a[href*="mod/assign/view.php?id="]');

            links.forEach(link => {
                const href = link.href;
                const url = new URL(href);
                const assignmentId = url.searchParams.get('id');

                // Only add if not already added (avoid duplicates)
                if (assignmentId && !assignmentIds.has(assignmentId)) {
                    assignmentIds.add(assignmentId);
                    assignments.push({ id: assignmentId, url: href });
                }
            });

            // console.log(`[Course ${courseId}] Found ${assignments.length} unique assignments (from ${links.length} links)`);
            return assignments;
        } catch (e) {
            // console.error(`Error fetching course ${courseId}:`, e);
            return [];
        }
    }

    function calculateStats(assignments, courseId) {
        const stats = { completed: 0, urgent: 0, remaining: 0 };
        const now = new Date();
        const urgentThreshold = CurrentConfig.URGENT_THRESHOLD_HOURS * 60 * 60 * 1000;

        /* 
        console.log(`[Course ${courseId}] === Calculating Stats ===`);
        console.log(`[Course ${courseId}] Total assignments in cache: ${assignments.length}`);
        console.log(`[Course ${courseId}] Urgent threshold: ${CurrentConfig.URGENT_THRESHOLD_HOURS} hours (${urgentThreshold}ms)`);
        console.log(`[Course ${courseId}] Current time: ${now.toISOString()}`);
        */

        assignments.forEach((assignment, index) => {
            if (!assignment) {
                return;
            }

            /*
            console.log(`[Course ${courseId}] Assignment ${assignment.id}:`);
            console.log(`  - Title: ${assignment.title || 'N/A'}`);
            console.log(`  - Submitted: ${assignment.isSubmitted}`);
            console.log(`  - Deadline: ${assignment.deadline}`);
            */

            if (assignment.isSubmitted) {
                stats.completed++;
                // console.log(`  => COMPLETED (제출완료)`);
            } else {
                const dueDate = parseDate(assignment.deadline);
                // console.log(`  - Parsed due date: ${dueDate ? dueDate.toISOString() : 'NULL'}`);

                if (dueDate) {
                    const diff = dueDate - now;
                    // const diffDays = diff / (24 * 60 * 60 * 1000);
                    // console.log(`  - Time diff: ${diff}ms (${diffDays.toFixed(2)} days)`);
                    // console.log(`  - Urgent threshold check: ${diff} <= ${urgentThreshold}?`);

                    // Changed: overdue OR within 7 days = urgent/overdue
                    if (diff < 0) {
                        stats.urgent++;
                        // console.log(`  => URGENT/OVERDUE (마감지남, ${Math.abs(diffDays).toFixed(2)} days ago)`);
                    } else if (diff <= urgentThreshold) {
                        stats.urgent++;
                        // console.log(`  => URGENT (7일 이내: ${diffDays.toFixed(2)} days left)`);
                    } else {
                        stats.remaining++;
                        // console.log(`  => REMAINING (7일 이상: ${diffDays.toFixed(2)} days left)`);
                    }
                } else {
                    stats.remaining++;
                    // console.log(`  => REMAINING (no valid deadline)`);
                }
            }
        });

        /*
        console.log(`[Course ${courseId}] === Final Stats ===`);
        console.log(`[Course ${courseId}] Completed: ${stats.completed}, Urgent: ${stats.urgent}, Remaining: ${stats.remaining}`);
        */

        return stats;
    }

    // Render stats on course card
    function renderCourseStats(courseDiv, stats, courseId, isLoading = false, progress = 0) {
        let statsContainer = courseDiv.querySelector('.course-assignment-stats');

        if (!statsContainer) {
            statsContainer = document.createElement('a');
            statsContainer.className = 'course-assignment-stats';
            statsContainer.href = `https://lms.gist.ac.kr/course/view.php?id=${courseId}`;
            courseDiv.appendChild(statsContainer);
        }

        if (isLoading) {
            // Circular Progress
            const radius = 12;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (progress * circumference);
            const percentage = Math.round(progress * 100);

            // Determine color based on progress (optional, or static)
            const strokeColor = '#4a90e2';

            // Check if ring already exists to update in-place (prevents animation flicker)
            const existingRing = statsContainer.querySelector('.progress-ring-circle');
            const existingText = statsContainer.querySelector('.progress-text');

            if (existingRing && existingText) {
                existingRing.style.strokeDashoffset = offset;
                existingText.textContent = `${percentage}%`;
            } else {
                statsContainer.innerHTML = `
                  <div class="progress-ring-container">
                    <svg class="progress-ring-svg">
                      <circle class="progress-ring-circle-bg" cx="16" cy="16" r="${radius}"></circle>
                      <circle class="progress-ring-circle" cx="16" cy="16" r="${radius}" 
                              style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; stroke: ${strokeColor};"></circle>
                    </svg>
                    <div class="progress-text">${percentage}%</div>
                  </div>
                `;
            }
        } else {
            // Add 'has-urgent' class if urgent count > 0
            const urgentClass = stats.urgent > 0 ? 'stat-urgent has-urgent' : 'stat-urgent';

            statsContainer.innerHTML = `
              <div class="stat-item stat-completed">
                <div class="stat-label">완료</div>
                <div class="stat-value">${stats.completed}</div>
              </div>
              <div class="stat-item ${urgentClass}">
                <div class="stat-label">임박/지각</div>
                <div class="stat-value">${stats.urgent}</div>
              </div>
              <div class="stat-item stat-remaining">
                <div class="stat-label">남음</div>
                <div class="stat-value">${stats.remaining}</div>
              </div>
            `;
        }
    }

    // Process a single course
    async function processCourse(courseId, courseDiv) {
        // console.log(`[Processing] Course ${courseId} - START`);

        // Initial Loading State (0%)
        renderCourseStats(courseDiv, { completed: 0, urgent: 0, remaining: 0 }, courseId, true, 0);

        // Fetch assignment list (Rate Limited)
        const assignments = await enqueueFetch(() => fetchCourseAssignments(courseId));

        if (assignments.length === 0) {
            renderCourseStats(courseDiv, { completed: 0, urgent: 0, remaining: 0 }, courseId, false);
            return;
        }

        // Check cache for each assignment
        const cacheKeys = assignments.map(a => `assignment_${a.id}`);
        const totalAssignments = assignments.length;
        let processedCount = 0;

        // Update progress helper
        const updateProgress = () => {
            const progress = totalAssignments > 0 ? processedCount / totalAssignments : 0;
            renderCourseStats(courseDiv, {}, courseId, true, progress);
        };

        // 10% progress just for fetching list
        // updateProgress(); // Don't jump too fast

        chrome.storage.local.get(cacheKeys, async (result) => {
            const cachedData = [];
            const now = Date.now();
            const missingOrInvalid = [];

            assignments.forEach(assignment => {
                const cacheKey = `assignment_${assignment.id}`;
                const cached = result[cacheKey];
                let isValid = false;

                if (cached) {
                    const ttl = cached.isSubmitted ? CurrentConfig.CACHE_TTL_SUBMITTED : CurrentConfig.CACHE_TTL_DEFAULT;
                    isValid = (now - cached.timestamp) < ttl;
                }

                if (isValid) {
                    cachedData.push(cached);
                    processedCount++;
                } else {
                    missingOrInvalid.push(assignment);
                }
            });

            // Update progress after checking cache
            updateProgress();

            // Fetch missing assignments
            for (const assignment of missingOrInvalid) {
                // Rate limited fetch
                const data = await enqueueFetch(() => fetchAssignmentDetails(assignment.url, assignment.id, courseId));

                if (data) {
                    cachedData.push(data);
                    // Update Cache
                    const cacheKey = `assignment_${assignment.id}`;
                    chrome.storage.local.set({ [cacheKey]: data });
                }

                processedCount++;
                updateProgress();
            }

            // Calculate and render stats with ALL data
            const stats = calculateStats(cachedData, courseId);
            renderCourseStats(courseDiv, stats, courseId, false);

            // console.log(`[Course ${courseId}] - COMPLETE`);
        });
    }

    // Main function to parse course list and process
    async function parseCourseListAndFetchStats() {
        // Load Options first
        const result = await chrome.storage.local.get(['options']);
        const options = result.options || {};
        const trackerOptions = options.tracker || {};
        const advancedOptions = options.advanced || {};

        // Check if feature is enabled
        const enableSummaryAtDashboard = trackerOptions.enableSummaryAtDashboard !== undefined
            ? trackerOptions.enableSummaryAtDashboard
            : true;

        if (!enableSummaryAtDashboard) {
            // console.log('[Course List Parser] Disabled via options');
            return;
        }

        // Update Config
        if (trackerOptions.urgentThresholdHours) CurrentConfig.URGENT_THRESHOLD_HOURS = trackerOptions.urgentThresholdHours;
        if (advancedOptions.fetchInterval) CurrentConfig.FETCH_INTERVAL = advancedOptions.fetchInterval;
        if (advancedOptions.cacheTtl) CurrentConfig.CACHE_TTL_DEFAULT = advancedOptions.cacheTtl;
        if (advancedOptions.cacheTtlSubmitted) CurrentConfig.CACHE_TTL_SUBMITTED = advancedOptions.cacheTtlSubmitted;

        const courseCards = document.querySelectorAll('.progress_courses .course_lists ul > li');

        // console.log(`[Course Parser] Found ${courseCards.length} course cards`);

        courseCards.forEach((card, index) => {
            const courseLink = card.querySelector('a.course_link');
            if (!courseLink) return;

            try {
                const url = new URL(courseLink.href);
                const courseId = url.searchParams.get('id');

                // Get the inner div
                const courseDiv = card.querySelector('div');
                if (!courseId || !courseDiv) return;

                // Extract course name and professor
                const courseNameElement = courseLink.querySelector('h3');
                let courseName = courseNameElement ? courseNameElement.textContent.trim() : null;
                if (courseName) {
                    courseName = courseName.replace(/NEW\s*/g, '').trim();
                }

                const professorNameElement = courseLink.querySelector('p');
                const professorName = professorNameElement ? professorNameElement.textContent.trim() : 'Unknown';

                // console.log(`[${index + 1}] ${courseName} (ID: ${courseId}) - ${professorName}`);

                // Process course directly (queue handles throttling)
                processCourse(courseId, courseDiv);

            } catch (e) {
                // console.error('Error processing course card:', e);
            }
        });
    }

    // Run parser when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', parseCourseListAndFetchStats);
    } else {
        parseCourseListAndFetchStats();
    }

})();
