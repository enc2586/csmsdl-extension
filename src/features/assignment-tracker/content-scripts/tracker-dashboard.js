// tracker-dashboard.js
(function () {
    'use strict';

    window.GistAssignmentTracker = window.GistAssignmentTracker || {};

    const Utils = window.GistAssignmentTracker.Utils;
    // const Config = window.GistAssignmentTracker.Config; // Not strictly needed here directly if we use listeners? Actually we need specific constants if they were used.

    // State management for Dashboard
    window.GistAssignmentTracker.Dashboard = {
        state: {
            assignments: {}, // { id: { title, deadline, isSubmitted, link, content } }
            timer: null,
            rendered: false,
            showContent: true, // Default true
            isLoading: true,
            loadedCount: 0,
            totalCount: 0
        },

        init: function () {
            // Load settings
            chrome.storage.local.get(['showAssignmentContent'], (result) => {
                this.state.showContent = result.showAssignmentContent !== undefined ? result.showAssignmentContent : true;
                this.render();
            });
        },

        registerAssignment: function (id, link, title) {
            this.state.assignments[id] = {
                id,
                link,
                title,
                isSubmitted: false,
                deadline: null,
                content: ''
            };
            this.state.totalCount++;
            this.scheduleUpdate();
        },

        updateAssignmentData: function (id, data) {
            if (this.state.assignments[id]) {
                this.state.assignments[id] = {
                    ...this.state.assignments[id],
                    title: data.title || this.state.assignments[id].title,
                    content: data.content || '',
                    isSubmitted: data.isSubmitted,
                    deadline: data.deadline
                };

                this.state.loadedCount++;
                if (this.state.loadedCount >= this.state.totalCount) {
                    this.state.isLoading = false;
                }

                this.scheduleUpdate();
            }
        },

        scheduleUpdate: function () {
            if (this.state.timer) clearTimeout(this.state.timer);
            // Use config constant
            const debounceMs = window.GistAssignmentTracker.Config.DASHBOAD_DEBOUNCE_MS || 500;
            this.state.timer = setTimeout(() => this.render(), debounceMs);
        },

        toggleSettingsModal: function () {
            let modal = document.getElementById('assignment-settings-modal');
            if (modal) {
                modal.remove();
            } else {
                this.showSettingsModal();
            }
        },

        showSettingsModal: function () {
            const modal = document.createElement('div');
            modal.id = 'assignment-settings-modal';
            modal.className = 'assignment-modal-overlay';

            modal.innerHTML = `
                <div class="assignment-modal-content">
                    <div class="assignment-modal-header">
                        <h3>과제 표시 설정</h3>
                        <button class="assignment-modal-close" id="close-modal-btn">&times;</button>
                    </div>
                    <div class="assignment-modal-body">
                        <label class="assignment-checkbox-label">
                            <input type="checkbox" id="show-content-checkbox" ${this.state.showContent ? 'checked' : ''}>
                            <span>과제 본문 표시</span>
                        </label>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            document.getElementById('close-modal-btn').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });

            document.getElementById('show-content-checkbox').addEventListener('change', (e) => {
                this.state.showContent = e.target.checked;
                chrome.storage.local.set({ showAssignmentContent: this.state.showContent });
                this.render();

                // Broadcast to update individual items
                // This requires a way to notify the main app or UI to re-render all items.
                // We'll dispatch a custom event.
                const event = new CustomEvent('GistAssignmentTracker:SettingsChanged', {
                    detail: { showContent: this.state.showContent }
                });
                window.dispatchEvent(event);
            });
        },

        render: function () {
            // 1. Find Insertion Point
            let container = document.getElementById('assignment-dashboard-root');
            if (!container) {
                const mainContent = document.querySelector('.course-content');
                const topicsList = mainContent ? mainContent.querySelector('ul.topics, ul.weeks') : null;

                if (topicsList) {
                    container = document.createElement('li');
                    container.id = 'assignment-dashboard-root';
                    container.className = 'section main assignment-dashboard-container';

                    const section0 = topicsList.querySelector('#section-0');

                    if (section0 && section0.nextSibling) {
                        topicsList.insertBefore(container, section0.nextSibling);
                    } else if (section0) {
                        topicsList.appendChild(container);
                    } else {
                        if (topicsList.firstChild) {
                            topicsList.insertBefore(container, topicsList.firstChild);
                        } else {
                            topicsList.appendChild(container);
                        }
                    }
                    this.state.rendered = true;
                } else {
                    return;
                }
            }

            // 2. Aggregate
            const assignments = Object.values(this.state.assignments);
            const total = assignments.length;

            let completed = 0;
            let urgentList = [];
            let overdueList = [];

            const now = new Date();
            const urgentThresholdMs = 72 * 60 * 60 * 1000;

            assignments.forEach(a => {
                if (a.isSubmitted) {
                    completed++;
                } else {
                    const dueDate = Utils.parseDate(a.deadline);
                    if (dueDate) {
                        const diff = dueDate - now;
                        if (diff < 0) {
                            overdueList.push({ ...a, diff });
                        } else if (diff <= urgentThresholdMs) {
                            urgentList.push({ ...a, diff });
                        }
                    }
                }
            });

            urgentList.sort((a, b) => a.diff - b.diff);
            overdueList.sort((a, b) => b.diff - a.diff);

            const urgentAndOverdue = urgentList.length + overdueList.length;
            const remaining = total - completed - urgentAndOverdue;

            // 3. Render HTML
            let html = `
          <div class="content">
            <div class="dashboard-divider"></div>
            <div class="dashboard-header">
              <span>과제 개요</span>
              <button class="dashboard-settings-btn" id="dashboard-settings-btn" title="설정">
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </button>
            </div>
            
            <div class="dashboard-stats">
              <div class="stat-item">
                <div class="stat-value" style="color: #2e7d32">${completed}</div>
                <div class="stat-label">완료</div>
              </div>
              <div class="stat-item">
                <div class="stat-value" style="color: #c62828">${urgentAndOverdue}</div>
                <div class="stat-label">임박/지각</div>
              </div>
              <div class="stat-item">
                <div class="stat-value" style="color: #757575">${remaining}</div>
                <div class="stat-label">남음</div>
              </div>
            </div>
        `;

            const itemsToShow = [...overdueList, ...urgentList];

            if (itemsToShow.length === 0) {
                html += `
             <div class="dashboard-empty">
               지금은 마감이 임박하거나 지난 과제가 없습니다.
             </div>
           `;
            } else {
                html += `<div class="task-list-title">임박/지각 과제</div>
                    <div class="dashboard-task-list">`;

                itemsToShow.forEach(item => {
                    let chipClass = 'status-warning';
                    let chipText = '마감임박';
                    if (item.diff < 0) {
                        chipClass = 'status-overdue';
                        chipText = '마감지남';
                    }

                    const formattedDeadline = item.deadline ? Utils.formatDateWithPadding(item.deadline) + '까지' : '';
                    const dueDate = Utils.parseDate(item.deadline);
                    const remainingTime = (dueDate && item.diff > 0) ? Utils.calculateTimeRemaining(dueDate) : '';

                    const contentHtml = this.state.showContent && item.content
                        ? `<div class="task-content">${item.content}</div>`
                        : '';

                    html += `
               <a href="${item.link}" class="dashboard-task-item">
                 <div class="task-left">
                   <span class="assignment-status-chip ${chipClass}">${chipText}</span>
                   <div class="task-info">
                     <span class="task-title" title="${item.title}">${item.title}</span>
                     ${contentHtml}
                   </div>
                 </div>
                 <span class="task-due">${formattedDeadline}${remainingTime}</span>
               </a>
             `;
                });
                html += `</div>`;
            }

            html += `</div>`; // Close .content
            container.innerHTML = html;

            const settingsBtn = document.getElementById('dashboard-settings-btn');
            if (settingsBtn) {
                settingsBtn.addEventListener('click', () => this.toggleSettingsModal());
            }
        }
    };
})();
