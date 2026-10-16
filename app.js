class StorageService {
  static #KEY = 'oop-task-manager';

  static save(data) {
    try {
      localStorage.setItem(this.#KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('Storage save failed:', err);
    }
  }

  static load() {
    try {
      return JSON.parse(localStorage.getItem(this.#KEY)) ?? [];
    } catch {
      return [];
    }
  }
}

class Task {
  #id;
  #title;
  #priority;
  #completed;
  #createdAt;

  constructor(title, priority = 'medium', data = {}) {
    this.#id        = data.id        ?? Task.generateId();
    this.#title     = title.trim();
    this.#priority  = priority;
    this.#completed = data.completed ?? false;
    this.#createdAt = data.createdAt ?? Date.now();
  }

  get id()        { return this.#id; }
  get title()     { return this.#title; }
  get priority()  { return this.#priority; }
  get completed() { return this.#completed; }
  get createdAt() { return this.#createdAt; }

  toggle() { this.#completed = !this.#completed; }

  getPriorityLabel() { return this.#priority; }

  toJSON() {
    return {
      id:        this.#id,
      title:     this.#title,
      priority:  this.#priority,
      completed: this.#completed,
      createdAt: this.#createdAt,
      type:      this.constructor.name,
    };
  }

  static generateId() {
    return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  static fromJSON(data) {
    const Cls = data.type === 'UrgentTask' ? UrgentTask : Task;
    return new Cls(data.title, data.priority, data);
  }
}

class UrgentTask extends Task {
  constructor(title, _priority, data = {}) {
    super(title, 'urgent', data);
  }

  getPriorityLabel() { return 'URGENT'; }

  toJSON() {
    return { ...super.toJSON(), type: 'UrgentTask' };
  }
}

class TaskManager {
  #tasks  = [];
  #filter = 'all';
  #listeners = new Set();   

  subscribe(fn) { this.#listeners.add(fn); return () => this.#listeners.delete(fn); }
  #notify()     { this.#listeners.forEach(fn => fn()); }

  addTask(title, priority) {
    if (!title?.trim()) return null;
    const task = priority === 'urgent'
      ? new UrgentTask(title)
      : new Task(title, priority);
    this.#tasks.unshift(task);      
    this.#persist();
    return task;
  }

  removeTask(id) {
    this.#tasks = this.#tasks.filter(t => t.id !== id);
    this.#persist();
  }

  toggleTask(id) {
    this.#tasks.find(t => t.id === id)?.toggle();
    this.#persist();
  }

  clearCompleted() {
    this.#tasks = this.#tasks.filter(t => !t.completed);
    this.#persist();
  }

  setFilter(filter) {
    this.#filter = filter;
    this.#notify();
  }

  get filter() { return this.#filter; }

  getVisibleTasks() {
    const map = {
      all:       () => true,
      active:    t => !t.completed,
      completed: t => t.completed,
    };
    return this.#tasks.filter(map[this.#filter] ?? map.all);
  }

  get activeCount() {
    return this.#tasks.reduce((n, t) => n + (t.completed ? 0 : 1), 0);
  }

  #persist() {
    StorageService.save(this.#tasks.map(t => t.toJSON()));
    this.#notify();
  }

  load() {
    this.#tasks = StorageService.load().map(Task.fromJSON);
    this.#notify();
  }
}

class UIRenderer {
  #manager;
  #form;
  #input;
  #prioritySelect;
  #list;
  #filters;
  #count;
  #clearBtn;

  constructor(manager) {
    this.#manager = manager;
    this.#cacheDOM();
    this.#bindEvents();
    manager.subscribe(() => this.render());   // reactive rendering
  }

  #cacheDOM() {
    this.#form           = document.getElementById('taskForm');
    this.#input          = document.getElementById('taskInput');
    this.#prioritySelect = document.getElementById('prioritySelect');
    this.#list           = document.getElementById('taskList');
    this.#filters        = document.getElementById('filters');
    this.#count          = document.getElementById('taskCount');
    this.#clearBtn       = document.getElementById('clearCompleted');
  }

  #bindEvents() {
    this.#form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#manager.addTask(this.#input.value, this.#prioritySelect.value);
      this.#input.value = '';
      this.#input.focus();
    });

    this.#list.addEventListener('click', (e) => {
      const li = e.target.closest('.task-item');
      if (!li) return;
      const id = li.dataset.id;

      if (e.target.matches('.task-item__checkbox')) this.#manager.toggleTask(id);
      if (e.target.matches('.task-item__delete'))   this.#manager.removeTask(id);
    });

    this.#filters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filters__btn');
      if (!btn) return;
      this.#manager.setFilter(btn.dataset.filter);
    });

    this.#clearBtn.addEventListener('click', () => this.#manager.clearCompleted());
  }

  render() {
    this.#renderList();
    this.#renderFilters();
    this.#renderCount();
  }

  #renderList() {
    const tasks = this.#manager.getVisibleTasks();

    if (tasks.length === 0) {
      this.#list.replaceChildren(this.#emptyState());
      return;
    }

    const frag = document.createDocumentFragment();
    tasks.forEach(t => frag.appendChild(this.#createTaskElement(t)));
    this.#list.replaceChildren(frag);
  }

  #createTaskElement(task) {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' is-completed' : ''}${
      task.priority === 'urgent' ? ' is-urgent' : ''
    }`;
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-item__checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', 'Toggle task');

    const content = document.createElement('div');
    content.className = 'task-item__content';

    const title = document.createElement('div');
    title.className = 'task-item__title';
    title.textContent = task.title;     

    const badge = document.createElement('span');
    badge.className = `task-item__badge task-item__badge--${task.priority}`;
    badge.textContent = task.getPriorityLabel();   

    content.append(title, badge);

    const del = document.createElement('button');
    del.className = 'task-item__delete';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Delete task');

    li.append(checkbox, content, del);
    return li;
  }

  #emptyState() {
    const li = document.createElement('li');
    li.className = 'task-list__empty';
    li.textContent = 'No tasks yet. Add one above ✨';
    return li;
  }

  #renderFilters() {
    const active = this.#manager.filter;
    this.#filters.querySelectorAll('.filters__btn').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.filter === active);
    });
  }

  #renderCount() {
    const n = this.#manager.activeCount;
    this.#count.textContent = `${n} ${n === 1 ? 'task' : 'tasks'} left`;
  }
}

(() => {
  const manager = new TaskManager();
  new UIRenderer(manager);
  manager.load();
})();