/**
 * TaskFlow Main Application Controller (app.js)
 * Manages reactive UI rendering, state management, drag-and-drop Kanban,
 * task filtering/sorting, real-time WebSocket events, and user interactions.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ================= STATE MANAGEMENT ================= //
  const state = {
    tasks: [],
    stats: null,
    currentView: 'board', // 'board' | 'list'
    filters: {
      status: 'all',     // 'all' | 'today' | 'overdue' | 'completed' | 'todo' | 'in_progress' | 'review'
      category: 'all',
      priority: 'all',
      search: '',
      sortBy: 'due_date'
    },
    modalSubtasks: [],
    editingTaskId: null,
    draggedTaskId: null,
    deletedTaskHistory: []
  };

  // ================= DOM ELEMENTS ================= //
  const elements = {
    authScreen: document.getElementById('authScreen'),
    tabLogin: document.getElementById('tabLogin'),
    tabRegister: document.getElementById('tabRegister'),
    loginForm: document.getElementById('loginForm'),
    registerForm: document.getElementById('registerForm'),
    authError: document.getElementById('authError'),
    btnDemoLogin: document.getElementById('btnDemoLogin'),
    
    // Header
    wsBadge: document.getElementById('wsBadge'),
    globalSearchInput: document.getElementById('globalSearchInput'),
    btnToggleTheme: document.getElementById('btnToggleTheme'),
    themeIconSun: document.getElementById('themeIconSun'),
    themeIconMoon: document.getElementById('themeIconMoon'),
    btnUserMenu: document.getElementById('btnUserMenu'),
    userDropdown: document.getElementById('userDropdown'),
    userAvatarText: document.getElementById('userAvatarText'),
    userDisplayName: document.getElementById('userDisplayName'),
    dropdownUserName: document.getElementById('dropdownUserName'),
    dropdownUserEmail: document.getElementById('dropdownUserEmail'),
    btnLogout: document.getElementById('btnLogout'),
    btnToggleSidebar: document.getElementById('btnToggleSidebar'),
    appSidebar: document.getElementById('appSidebar'),
    btnOpenArchitecture: document.getElementById('btnOpenArchitecture'),
    btnOpenActivity: document.getElementById('btnOpenActivity'),

    // Sidebar & Filters
    btnNewTask: document.getElementById('btnNewTask'),
    countAll: document.getElementById('countAll'),
    countToday: document.getElementById('countToday'),
    countOverdue: document.getElementById('countOverdue'),
    countCompleted: document.getElementById('countCompleted'),

    // Hero Progress & Stats (TaskBuddy feature)
    progressRingBar: document.getElementById('progressRingBar'),
    progressPercentText: document.getElementById('progressPercentText'),
    progressSummaryText: document.getElementById('progressSummaryText'),
    progressLinearFill: document.getElementById('progressLinearFill'),
    statTotalTasks: document.getElementById('statTotalTasks'),
    statInProgress: document.getElementById('statInProgress'),
    statCompleted: document.getElementById('statCompleted'),
    statOverdue: document.getElementById('statOverdue'),

    // Quick Add
    quickAddForm: document.getElementById('quickAddForm'),
    quickTaskTitle: document.getElementById('quickTaskTitle'),
    quickTaskCategory: document.getElementById('quickTaskCategory'),
    quickTaskPriority: document.getElementById('quickTaskPriority'),

    // View Controls
    viewTabBoard: document.getElementById('viewTabBoard'),
    viewTabList: document.getElementById('viewTabList'),
    sortBySelect: document.getElementById('sortBySelect'),
    btnClearCompleted: document.getElementById('btnClearCompleted'),

    // Views
    kanbanBoardView: document.getElementById('kanbanBoardView'),
    taskListView: document.getElementById('taskListView'),
    taskListItems: document.getElementById('taskListItems'),
    emptyTasksState: document.getElementById('emptyTasksState'),
    btnEmptyCreate: document.getElementById('btnEmptyCreate'),

    // Kanban Dropzones & Badges
    dropzoneTodo: document.getElementById('dropzoneTodo'),
    dropzoneInProgress: document.getElementById('dropzoneInProgress'),
    dropzoneReview: document.getElementById('dropzoneReview'),
    dropzoneCompleted: document.getElementById('dropzoneCompleted'),
    countColTodo: document.getElementById('countColTodo'),
    countColInProgress: document.getElementById('countColInProgress'),
    countColReview: document.getElementById('countColReview'),
    countColCompleted: document.getElementById('countColCompleted'),

    // Task Modal
    taskModal: document.getElementById('taskModal'),
    taskModalTitle: document.getElementById('taskModalTitle'),
    taskModalForm: document.getElementById('taskModalForm'),
    modalTaskId: document.getElementById('modalTaskId'),
    modalTaskTitle: document.getElementById('modalTaskTitle'),
    modalTaskDescription: document.getElementById('modalTaskDescription'),
    modalTaskCategory: document.getElementById('modalTaskCategory'),
    modalTaskPriority: document.getElementById('modalTaskPriority'),
    modalTaskStatus: document.getElementById('modalTaskStatus'),
    modalTaskDueDate: document.getElementById('modalTaskDueDate'),
    modalSubtasksList: document.getElementById('modalSubtasksList'),
    modalNewSubtaskInput: document.getElementById('modalNewSubtaskInput'),
    btnAddSubtaskBtn: document.getElementById('btnAddSubtaskBtn'),
    btnCloseModal: document.getElementById('btnCloseModal'),
    btnCancelModal: document.getElementById('btnCancelModal'),

    // Activity Drawer
    activityDrawer: document.getElementById('activityDrawer'),
    btnCloseActivity: document.getElementById('btnCloseActivity'),
    activityLogList: document.getElementById('activityLogList'),

    // Architecture Modal
    architectureModal: document.getElementById('architectureModal'),
    btnCloseArchModal: document.getElementById('btnCloseArchModal'),
    btnCloseArchModalBtn: document.getElementById('btnCloseArchModalBtn'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer')
  };

  // ================= TOAST NOTIFICATION HELPER ================= //
  function showToast(message, actionLabel = null, onAction = null, duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'toast-message';
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    if (actionLabel && onAction) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-undo-btn';
      actionBtn.textContent = actionLabel;
      actionBtn.onclick = () => {
        onAction();
        toast.remove();
      };
      toast.appendChild(actionBtn);
    }

    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }

  // ================= THEME TOGGLER ================= //
  function initTheme() {
    const savedTheme = localStorage.getItem('taskflow_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcons(savedTheme);

    elements.btnToggleTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('taskflow_theme', next);
      updateThemeIcons(next);
    });
  }

  function updateThemeIcons(theme) {
    if (theme === 'dark') {
      elements.themeIconSun.classList.remove('hidden');
      elements.themeIconMoon.classList.add('hidden');
    } else {
      elements.themeIconSun.classList.add('hidden');
      elements.themeIconMoon.classList.remove('hidden');
    }
  }

  // ================= AUTHENTICATION FLOW ================= //
  function checkAuthState() {
    if (!api.token || !api.currentUser) {
      showAuthScreen();
    } else {
      hideAuthScreen();
      updateUserInterface(api.currentUser);
      loadTasks();
      loadStats();
      api.initWebSocket();
    }
  }

  function showAuthScreen() {
    elements.authScreen.classList.remove('hidden');
    elements.loginEmail.focus();
  }

  function hideAuthScreen() {
    elements.authScreen.classList.add('hidden');
  }

  function updateUserInterface(user) {
    if (!user) return;
    elements.userDisplayName.textContent = user.name;
    elements.dropdownUserName.textContent = user.name;
    elements.dropdownUserEmail.textContent = user.email;

    // Initials for avatar
    const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'TF';
    elements.userAvatarText.textContent = initials;
    if (user.avatarColor) {
      elements.userAvatarText.style.background = user.avatarColor;
    }
  }

  function setupAuthEvents() {
    // Switch between Sign In and Sign Up tabs
    elements.tabLogin.addEventListener('click', () => {
      elements.tabLogin.classList.add('active');
      elements.tabRegister.classList.remove('active');
      elements.loginForm.classList.remove('hidden');
      elements.registerForm.classList.add('hidden');
      elements.authError.classList.add('hidden');
    });

    elements.tabRegister.addEventListener('click', () => {
      elements.tabRegister.classList.add('active');
      elements.tabLogin.classList.remove('active');
      elements.registerForm.classList.remove('hidden');
      elements.loginForm.classList.add('hidden');
      elements.authError.classList.add('hidden');
    });

    // Login Form Submit
    elements.loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      elements.authError.classList.add('hidden');
      const email = elements.loginEmail.value.trim();
      const password = elements.loginPassword.value;

      try {
        const res = await api.login(email, password);
        updateUserInterface(res.user);
        hideAuthScreen();
        loadTasks();
        loadStats();
        showToast(`Welcome back, ${res.user.name}!`);
      } catch (err) {
        elements.authError.textContent = err.message || 'Login failed';
        elements.authError.classList.remove('hidden');
      }
    });

    // Register Form Submit
    elements.registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      elements.authError.classList.add('hidden');
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const avatarColor = document.querySelector('input[name="avatarColor"]:checked')?.value || '#6366f1';

      try {
        const res = await api.register(name, email, password, avatarColor);
        updateUserInterface(res.user);
        hideAuthScreen();
        loadTasks();
        loadStats();
        showToast(`Account created! Welcome, ${res.user.name}!`);
      } catch (err) {
        elements.authError.textContent = err.message || 'Registration failed';
        elements.authError.classList.remove('hidden');
      }
    });

    // Demo 1-Click Login
    elements.btnDemoLogin.addEventListener('click', async () => {
      try {
        const res = await api.demoLogin();
        updateUserInterface(res.user);
        hideAuthScreen();
        loadTasks();
        loadStats();
        showToast(`Logged into Demo Account! Real-time sync ready.`);
      } catch (err) {
        showToast(err.message, null, null, 4000);
      }
    });

    // User Dropdown Menu
    elements.btnUserMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.userDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      elements.userDropdown.classList.add('hidden');
    });

    // Logout
    elements.btnLogout.addEventListener('click', async () => {
      await api.logout();
      showAuthScreen();
      showToast('Signed out successfully');
    });

    // Listen for auth required event
    window.addEventListener('auth:required', () => {
      showAuthScreen();
      showToast('Session expired. Please sign in again.');
    });
  }

  // ================= WEBSOCKET SYNC BADGE ================= //
  function setupWebSocketStatus() {
    window.addEventListener('ws:status', (event) => {
      const { status } = event.detail;
      elements.wsBadge.className = `ws-status-badge ${status}`;
      const label = elements.wsBadge.querySelector('.status-label');

      if (status === 'connected') {
        label.textContent = 'Live Sync';
        elements.wsBadge.title = 'Real-time WebSocket connected and active';
      } else if (status === 'reconnecting') {
        label.textContent = 'Reconnecting';
        elements.wsBadge.title = 'Reconnecting to real-time server...';
      } else {
        label.textContent = 'Offline';
        elements.wsBadge.title = 'Offline. Changes saved locally and synced on reconnect.';
      }
    });

    // Listen to real-time events broadcasted over WebSocket
    api.on('task:created', (data) => {
      if (!data || !data.task) return;
      const exists = state.tasks.some(t => t.id === data.task.id);
      if (!exists) {
        state.tasks.unshift(data.task);
        renderCurrentView();
        loadStats();
        showToast(`New task added: "${data.task.title}"`);
      }
    });

    api.on('task:updated', (data) => {
      if (!data || !data.task) return;
      const idx = state.tasks.findIndex(t => t.id === data.task.id);
      if (idx !== -1) {
        state.tasks[idx] = data.task;
      } else {
        state.tasks.unshift(data.task);
      }
      renderCurrentView();
      loadStats();
    });

    api.on('task:deleted', (data) => {
      if (!data || !data.taskId) return;
      state.tasks = state.tasks.filter(t => t.id !== data.taskId);
      renderCurrentView();
      loadStats();
    });

    api.on('tasks:cleared', () => {
      loadTasks();
      loadStats();
      showToast('Completed tasks cleared');
    });
  }

  // ================= DATA LOADING ================= //
  async function loadTasks() {
    try {
      const tasks = await api.getTasks(state.filters);
      state.tasks = tasks;
      renderCurrentView();
    } catch (err) {
      console.warn('Failed to load tasks:', err);
    }
  }

  async function loadStats() {
    try {
      const stats = await api.getStats();
      state.stats = stats;
      renderProgressAndStats(stats);
      updateSidebarCounts(stats);
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }

  // ================= PROGRESS & STATS RENDERING (TaskBuddy) ================= //
  function renderProgressAndStats(stats) {
    if (!stats) return;

    // Numbers
    elements.statTotalTasks.textContent = stats.total;
    elements.statInProgress.textContent = stats.inProgress;
    elements.statCompleted.textContent = stats.completed;
    elements.statOverdue.textContent = stats.overdue;

    // Completion percentage & circular SVG donut
    const rate = stats.completionRate || 0;
    elements.progressPercentText.textContent = `${rate}%`;
    elements.progressLinearFill.style.width = `${rate}%`;

    // SVG donut math: radius = 44, circumference = 2 * PI * 44 = ~276.46
    const circumference = 276.46;
    const offset = circumference - (circumference * rate) / 100;
    elements.progressRingBar.style.strokeDashoffset = offset;

    // Motivational summary text
    if (stats.total === 0) {
      elements.progressSummaryText.textContent = 'No tasks yet. Create one to begin your streak!';
    } else if (rate === 100) {
      elements.progressSummaryText.textContent = '🎉 Incredible! All tasks are completed!';
    } else if (rate >= 50) {
      elements.progressSummaryText.textContent = `Great momentum! ${stats.completed} of ${stats.total} tasks completed.`;
    } else {
      elements.progressSummaryText.textContent = `${stats.inProgress + stats.todo} tasks remaining today. Keep pushing!`;
    }
  }

  function updateSidebarCounts(stats) {
    if (!stats) return;
    elements.countAll.textContent = stats.total;
    elements.countToday.textContent = stats.dueToday;
    elements.countOverdue.textContent = stats.overdue;
    elements.countCompleted.textContent = stats.completed;
  }

  // ================= VIEW SWITCHER & RENDERING ================= //
  function renderCurrentView() {
    // Check if empty
    const filteredTasks = filterAndSortTasks(state.tasks);

    if (filteredTasks.length === 0) {
      elements.emptyTasksState.classList.remove('hidden');
    } else {
      elements.emptyTasksState.classList.add('hidden');
    }

    if (state.currentView === 'board') {
      elements.kanbanBoardView.classList.remove('hidden');
      elements.taskListView.classList.add('hidden');
      renderKanbanBoard(filteredTasks);
    } else {
      elements.kanbanBoardView.classList.add('hidden');
      elements.taskListView.classList.remove('hidden');
      renderListView(filteredTasks);
    }
  }

  function filterAndSortTasks(tasks) {
    const today = new Date().toISOString().split('T')[0];

    return tasks.filter(task => {
      // Status filter
      if (state.filters.status === 'today') {
        if (task.status === 'completed' || task.due_date !== today) return false;
      } else if (state.filters.status === 'overdue') {
        if (task.status === 'completed' || !task.due_date || task.due_date >= today) return false;
      } else if (state.filters.status === 'completed') {
        if (task.status !== 'completed') return false;
      } else if (state.filters.status !== 'all') {
        if (task.status !== state.filters.status) return false;
      }

      // Category filter
      if (state.filters.category !== 'all' && task.category !== state.filters.category) {
        return false;
      }

      // Priority filter
      if (state.filters.priority !== 'all' && task.priority !== state.filters.priority) {
        return false;
      }

      // Search term
      if (state.filters.search.trim()) {
        const query = state.filters.search.toLowerCase().trim();
        const inTitle = task.title.toLowerCase().includes(query);
        const inDesc = (task.description || '').toLowerCase().includes(query);
        if (!inTitle && !inDesc) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort logic
      switch (state.filters.sortBy) {
        case 'priority': {
          const rank = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
          return (rank[a.priority] || 5) - (rank[b.priority] || 5);
        }
        case 'title':
          return a.title.localeCompare(b.title);
        case 'created_at':
          return new Date(b.created_at) - new Date(a.created_at);
        case 'due_date':
        default: {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        }
      }
    });
  }

  // ================= KANBAN BOARD RENDERING ================= //
  function renderKanbanBoard(tasks) {
    const columns = {
      todo: [],
      in_progress: [],
      review: [],
      completed: []
    };

    tasks.forEach(task => {
      const col = columns[task.status] || columns.todo;
      col.push(task);
    });

    elements.dropzoneTodo.innerHTML = '';
    elements.dropzoneInProgress.innerHTML = '';
    elements.dropzoneReview.innerHTML = '';
    elements.dropzoneCompleted.innerHTML = '';

    elements.countColTodo.textContent = columns.todo.length;
    elements.countColInProgress.textContent = columns.in_progress.length;
    elements.countColReview.textContent = columns.review.length;
    elements.countColCompleted.textContent = columns.completed.length;

    columns.todo.forEach(t => elements.dropzoneTodo.appendChild(createTaskCardElement(t)));
    columns.in_progress.forEach(t => elements.dropzoneInProgress.appendChild(createTaskCardElement(t)));
    columns.review.forEach(t => elements.dropzoneReview.appendChild(createTaskCardElement(t)));
    columns.completed.forEach(t => elements.dropzoneCompleted.appendChild(createTaskCardElement(t)));
  }

  function createTaskCardElement(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.setAttribute('draggable', 'true');
    card.dataset.taskId = task.id;

    // Due date calculation
    const today = new Date().toISOString().split('T')[0];
    let dueClass = '';
    let dueText = task.due_date || 'No date';
    if (task.due_date) {
      if (task.status !== 'completed' && task.due_date < today) {
        dueClass = 'overdue';
        dueText = `Overdue (${task.due_date})`;
      } else if (task.due_date === today) {
        dueClass = 'today';
        dueText = 'Due Today';
      }
    }

    // Subtasks summary
    const subtasks = task.subtasks || [];
    const totalSub = subtasks.length;
    const completedSub = subtasks.filter(s => s.completed).length;
    const subPercent = totalSub > 0 ? (completedSub / totalSub) * 100 : 0;

    card.innerHTML = `
      <div class="task-card-header">
        <div class="task-badge-row">
          <span class="task-badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
          <span class="task-badge badge-category">${task.category}</span>
        </div>
        <div class="task-card-actions">
          <button class="btn-icon-sm btn-edit-task" title="Edit Task" data-id="${task.id}">✏️</button>
          <button class="btn-icon-sm btn-delete-task" title="Delete Task" data-id="${task.id}">🗑️</button>
        </div>
      </div>

      <h4 class="task-card-title">${escapeHtml(task.title)}</h4>
      ${task.description ? `<p class="task-card-desc">${escapeHtml(task.description)}</p>` : ''}

      ${totalSub > 0 ? `
        <div class="task-subtasks-preview">
          <span>✓ ${completedSub}/${totalSub}</span>
          <div class="subtasks-mini-bar">
            <div class="subtasks-mini-fill" style="width: ${subPercent}%"></div>
          </div>
        </div>
      ` : ''}

      <div class="task-card-footer">
        <span class="task-due-date ${dueClass}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          ${dueText}
        </span>
        <button class="btn-icon-sm btn-toggle-complete" title="Toggle Completed" data-id="${task.id}">
          ${task.status === 'completed' ? '✅' : '⚪'}
        </button>
      </div>
    `;

    // Event listeners on card actions
    card.querySelector('.btn-edit-task').onclick = (e) => {
      e.stopPropagation();
      openEditTaskModal(task);
    };

    card.querySelector('.btn-delete-task').onclick = (e) => {
      e.stopPropagation();
      confirmDeleteTask(task);
    };

    card.querySelector('.btn-toggle-complete').onclick = async (e) => {
      e.stopPropagation();
      const newStatus = task.status === 'completed' ? 'todo' : 'completed';
      await updateTaskStatusOptimistic(task.id, newStatus);
    };

    card.onclick = () => openEditTaskModal(task);

    // Drag events
    card.addEventListener('dragstart', (e) => {
      state.draggedTaskId = task.id;
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', task.id);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      state.draggedTaskId = null;
    });

    return card;
  }

  // ================= LIST VIEW RENDERING ================= //
  function renderListView(tasks) {
    elements.taskListItems.innerHTML = '';
    const today = new Date().toISOString().split('T')[0];

    tasks.forEach(task => {
      const row = document.createElement('div');
      row.className = `list-table-row ${task.status === 'completed' ? 'completed-row' : ''}`;
      row.dataset.taskId = task.id;

      const subtasks = task.subtasks || [];
      const totalSub = subtasks.length;
      const completedSub = subtasks.filter(s => s.completed).length;

      let dueClass = '';
      if (task.due_date) {
        if (task.status !== 'completed' && task.due_date < today) dueClass = 'overdue';
        else if (task.due_date === today) dueClass = 'today';
      }

      row.innerHTML = `
        <div>
          <div class="custom-checkbox ${task.status === 'completed' ? 'checked' : ''}" data-id="${task.id}">
            ${task.status === 'completed' ? '✓' : ''}
          </div>
        </div>
        <div class="row-details">
          <span class="row-title">${escapeHtml(task.title)}</span>
          ${task.description ? `<span class="row-desc">${escapeHtml(task.description)}</span>` : ''}
        </div>
        <div>
          <span class="task-badge badge-category">${task.category}</span>
        </div>
        <div>
          <span class="task-badge badge-${task.priority.toLowerCase()}">${task.priority}</span>
        </div>
        <div class="list-due-col">
          <span class="task-due-date ${dueClass}">${task.due_date || '-'}</span>
        </div>
        <div class="list-subtasks-col">
          ${totalSub > 0 ? `<small>${completedSub}/${totalSub} steps</small>` : `<small class="text-muted">-</small>`}
        </div>
        <div class="list-actions">
          <button class="btn-icon-sm btn-edit-task" title="Edit Task" data-id="${task.id}">✏️</button>
          <button class="btn-icon-sm btn-delete-task" title="Delete Task" data-id="${task.id}">🗑️</button>
        </div>
      `;

      row.querySelector('.custom-checkbox').onclick = async (e) => {
        e.stopPropagation();
        const newStatus = task.status === 'completed' ? 'todo' : 'completed';
        await updateTaskStatusOptimistic(task.id, newStatus);
      };

      row.querySelector('.btn-edit-task').onclick = (e) => {
        e.stopPropagation();
        openEditTaskModal(task);
      };

      row.querySelector('.btn-delete-task').onclick = (e) => {
        e.stopPropagation();
        confirmDeleteTask(task);
      };

      row.onclick = () => openEditTaskModal(task);

      elements.taskListItems.appendChild(row);
    });
  }

  // ================= DRAG & DROP LOGIC ================= //
  function setupDragAndDrop() {
    const dropzones = [
      { el: elements.dropzoneTodo, status: 'todo' },
      { el: elements.dropzoneInProgress, status: 'in_progress' },
      { el: elements.dropzoneReview, status: 'review' },
      { el: elements.dropzoneCompleted, status: 'completed' }
    ];

    dropzones.forEach(({ el, status }) => {
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });

      el.addEventListener('dragleave', (e) => {
        // Prevent flickering when hovering children
        if (!el.contains(e.relatedTarget)) {
          el.classList.remove('drag-over');
        }
      });

      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/plain') || state.draggedTaskId;
        if (!taskId) return;

        const task = state.tasks.find(t => t.id === taskId);
        if (task && task.status !== status) {
          await updateTaskStatusOptimistic(taskId, status);
        }
      });
    });
  }

  async function updateTaskStatusOptimistic(taskId, newStatus) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    const oldStatus = task.status;
    task.status = newStatus;
    renderCurrentView();

    try {
      await api.updateTaskStatus(taskId, newStatus);
      loadStats();
    } catch (err) {
      // Revert if API failed
      task.status = oldStatus;
      renderCurrentView();
      showToast(`Failed to update status: ${err.message}`);
    }
  }

  // ================= TASK CREATION & EDIT MODAL ================= //
  function setupTaskModal() {
    // Open for Create
    elements.btnNewTask.addEventListener('click', () => openCreateTaskModal());
    elements.btnEmptyCreate.addEventListener('click', () => openCreateTaskModal());

    // Column plus buttons
    document.querySelectorAll('.btn-add-in-col').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const status = e.currentTarget.dataset.status;
        openCreateTaskModal(status);
      });
    });

    // Close buttons
    elements.btnCloseModal.onclick = () => elements.taskModal.close();
    elements.btnCancelModal.onclick = () => elements.taskModal.close();

    // Add subtask inside modal
    elements.btnAddSubtaskBtn.onclick = () => addSubtaskToModal();
    elements.modalNewSubtaskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addSubtaskToModal();
      }
    });

    // Form submission
    elements.taskModalForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = elements.modalTaskTitle.value.trim();
      const description = elements.modalTaskDescription.value.trim();
      const category = elements.modalTaskCategory.value;
      const priority = elements.modalTaskPriority.value;
      const status = elements.modalTaskStatus.value;
      const due_date = elements.modalTaskDueDate.value || null;

      if (!title) return;

      const payload = {
        title,
        description,
        category,
        priority,
        status,
        due_date,
        subtasks: state.modalSubtasks
      };

      try {
        if (state.editingTaskId) {
          const updated = await api.updateTask(state.editingTaskId, payload);
          const idx = state.tasks.findIndex(t => t.id === state.editingTaskId);
          if (idx !== -1) state.tasks[idx] = updated;
          showToast(`Task "${title}" updated`);
        } else {
          const created = await api.createTask(payload);
          state.tasks.unshift(created);
          showToast(`Task "${title}" created`);
        }

        elements.taskModal.close();
        renderCurrentView();
        loadStats();
      } catch (err) {
        showToast(`Error: ${err.message}`);
      }
    });
  }

  function openCreateTaskModal(prefilledStatus = 'todo') {
    state.editingTaskId = null;
    state.modalSubtasks = [];
    elements.taskModalTitle.textContent = 'Create New Task';
    elements.modalTaskId.value = '';
    elements.modalTaskTitle.value = '';
    elements.modalTaskDescription.value = '';
    elements.modalTaskCategory.value = 'Projects';
    elements.modalTaskPriority.value = 'Medium';
    elements.modalTaskStatus.value = prefilledStatus;
    elements.modalTaskDueDate.value = '';
    elements.modalNewSubtaskInput.value = '';

    renderModalSubtasks();
    elements.taskModal.showModal();
    elements.modalTaskTitle.focus();
  }

  function openEditTaskModal(task) {
    state.editingTaskId = task.id;
    state.modalSubtasks = (task.subtasks || []).map(s => ({ title: s.title, completed: !!s.completed, id: s.id }));
    elements.taskModalTitle.textContent = 'Edit Task';
    elements.modalTaskId.value = task.id;
    elements.modalTaskTitle.value = task.title;
    elements.modalTaskDescription.value = task.description || '';
    elements.modalTaskCategory.value = task.category || 'General';
    elements.modalTaskPriority.value = task.priority || 'Medium';
    elements.modalTaskStatus.value = task.status || 'todo';
    elements.modalTaskDueDate.value = task.due_date || '';
    elements.modalNewSubtaskInput.value = '';

    renderModalSubtasks();
    elements.taskModal.showModal();
    elements.modalTaskTitle.focus();
  }

  function addSubtaskToModal() {
    const text = elements.modalNewSubtaskInput.value.trim();
    if (!text) return;

    state.modalSubtasks.push({ title: text, completed: false });
    elements.modalNewSubtaskInput.value = '';
    renderModalSubtasks();
  }

  function renderModalSubtasks() {
    elements.modalSubtasksList.innerHTML = '';
    state.modalSubtasks.forEach((sub, idx) => {
      const item = document.createElement('div');
      item.className = 'modal-subtask-item';
      item.innerHTML = `
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">
          <input type="checkbox" ${sub.completed ? 'checked' : ''} data-idx="${idx}">
          <span style="${sub.completed ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${escapeHtml(sub.title)}</span>
        </label>
        <button type="button" class="btn-icon-sm" data-idx="${idx}">&times;</button>
      `;

      item.querySelector('input').onchange = (e) => {
        state.modalSubtasks[idx].completed = e.target.checked;
        renderModalSubtasks();
      };

      item.querySelector('button').onclick = () => {
        state.modalSubtasks.splice(idx, 1);
        renderModalSubtasks();
      };

      elements.modalSubtasksList.appendChild(item);
    });
  }

  // ================= RAPID QUICK ADD ================= //
  function setupQuickAdd() {
    elements.quickAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = elements.quickTaskTitle.value.trim();
      if (!title) return;

      const category = elements.quickTaskCategory.value;
      const priority = elements.quickTaskPriority.value;

      try {
        const created = await api.createTask({
          title,
          category,
          priority,
          status: 'todo'
        });
        state.tasks.unshift(created);
        elements.quickTaskTitle.value = '';
        renderCurrentView();
        loadStats();
        showToast(`Task "${title}" created rapidly!`);
      } catch (err) {
        showToast(`Failed to create task: ${err.message}`);
      }
    });
  }

  // ================= TASK DELETION & UNDO ================= //
  async function confirmDeleteTask(task) {
    if (!confirm(`Are you sure you want to delete "${task.title}"?`)) return;

    try {
      const deleted = await api.deleteTask(task.id);
      state.tasks = state.tasks.filter(t => t.id !== task.id);
      renderCurrentView();
      loadStats();

      // Undo capability
      showToast(`Task deleted`, 'Undo', async () => {
        try {
          const restored = await api.createTask(deleted);
          state.tasks.unshift(restored);
          renderCurrentView();
          loadStats();
          showToast(`Task "${restored.title}" restored!`);
        } catch (err) {
          showToast(`Could not restore: ${err.message}`);
        }
      });
    } catch (err) {
      showToast(`Delete failed: ${err.message}`);
    }
  }

  function setupClearCompleted() {
    elements.btnClearCompleted.addEventListener('click', async () => {
      const completedCount = state.tasks.filter(t => t.status === 'completed').length;
      if (completedCount === 0) {
        return showToast('No completed tasks to clear.');
      }

      if (!confirm(`Clear all ${completedCount} completed tasks permanently?`)) return;

      try {
        await api.clearCompletedTasks();
        state.tasks = state.tasks.filter(t => t.status !== 'completed');
        renderCurrentView();
        loadStats();
        showToast(`Cleared ${completedCount} completed tasks`);
      } catch (err) {
        showToast(`Error: ${err.message}`);
      }
    });
  }

  // ================= FILTERS & SEARCH ================= //
  function setupFilters() {
    // View Tab Switcher (Board vs List)
    elements.viewTabBoard.addEventListener('click', () => {
      state.currentView = 'board';
      elements.viewTabBoard.classList.add('active');
      elements.viewTabList.classList.remove('active');
      renderCurrentView();
    });

    elements.viewTabList.addEventListener('click', () => {
      state.currentView = 'list';
      elements.viewTabList.classList.add('active');
      elements.viewTabBoard.classList.remove('active');
      renderCurrentView();
    });

    // Timeframe filters (All, Today, Overdue, Completed)
    document.querySelectorAll('.nav-filter-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-filter-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.status = btn.dataset.filterStatus;
        renderCurrentView();
      });
    });

    // Category Pills
    document.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.category = btn.dataset.filterCategory;
        renderCurrentView();
      });
    });

    // Priority Pills
    document.querySelectorAll('.prio-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.prio-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.priority = btn.dataset.filterPriority;
        renderCurrentView();
      });
    });

    // Sort Dropdown
    elements.sortBySelect.addEventListener('change', (e) => {
      state.filters.sortBy = e.target.value;
      renderCurrentView();
    });

    // Global Search
    elements.globalSearchInput.addEventListener('input', (e) => {
      state.filters.search = e.target.value;
      renderCurrentView();
    });

    // Keyboard shortcut '/' or 'Ctrl+K'
    document.addEventListener('keydown', (e) => {
      if ((e.key === '/' && document.activeElement !== elements.globalSearchInput && !document.activeElement.matches('input, textarea')) ||
          (e.ctrlKey && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        elements.globalSearchInput.focus();
        elements.globalSearchInput.select();
      }
    });
  }

  // ================= ACTIVITY FEED DRAWER ================= //
  function setupActivityDrawer() {
    elements.btnOpenActivity.addEventListener('click', async () => {
      elements.activityDrawer.classList.remove('hidden');
      elements.activityLogList.innerHTML = '<p class="text-muted" style="padding:1rem;">Loading activity...</p>';

      try {
        const activities = await api.getActivity(20);
        if (activities.length === 0) {
          elements.activityLogList.innerHTML = '<p class="text-muted" style="padding:1rem;">No recent activities logged yet.</p>';
          return;
        }

        elements.activityLogList.innerHTML = '';
        activities.forEach(act => {
          const item = document.createElement('div');
          item.className = 'activity-item';
          const time = new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          item.innerHTML = `
            <div class="activity-meta">
              <strong style="text-transform:uppercase;color:var(--accent-primary)">${act.action.replace('_', ' ')}</strong>
              <span>${time}</span>
            </div>
            <div>${escapeHtml(act.details)}</div>
          `;
          elements.activityLogList.appendChild(item);
        });
      } catch (err) {
        elements.activityLogList.innerHTML = `<p class="text-danger">Failed to load feed: ${err.message}</p>`;
      }
    });

    elements.btnCloseActivity.addEventListener('click', () => {
      elements.activityDrawer.classList.add('hidden');
    });
  }

  // ================= ARCHITECTURE MODAL ================= //
  function setupArchitectureModal() {
    elements.btnOpenArchitecture.addEventListener('click', () => {
      elements.architectureModal.showModal();
    });

    elements.btnCloseArchModal.addEventListener('click', () => {
      elements.architectureModal.close();
    });

    elements.btnCloseArchModalBtn.addEventListener('click', () => {
      elements.architectureModal.close();
    });
  }

  // ================= MOBILE NAVIGATION ================= //
  function setupMobileNavigation() {
    elements.btnToggleSidebar.addEventListener('click', () => {
      elements.appSidebar.classList.toggle('mobile-open');
    });

    document.addEventListener('click', (e) => {
      if (elements.appSidebar.classList.contains('mobile-open') &&
          !elements.appSidebar.contains(e.target) &&
          !elements.btnToggleSidebar.contains(e.target)) {
        elements.appSidebar.classList.remove('mobile-open');
      }
    });
  }

  // ================= UTILITIES ================= //
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ================= INITIALIZE ================= //
  initTheme();
  setupAuthEvents();
  setupWebSocketStatus();
  setupDragAndDrop();
  setupTaskModal();
  setupQuickAdd();
  setupClearCompleted();
  setupFilters();
  setupActivityDrawer();
  setupArchitectureModal();
  setupMobileNavigation();

  // Check login state on start
  checkAuthState();
});
