import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../services/storage.js';
import { playReminderChime } from '../components/TodoListPanel.js';

describe('Todo & Reminder System', () => {
  beforeEach(async () => {
    localStorage.clear();
    await StorageService.saveTodos([]);
  });

  it('creates a new todo with reminder timestamp and priority', async () => {
    const dueTime = Date.now() + 60 * 60 * 1000; // in 1 hour
    const todo = await StorageService.addTodo({
      title: 'Watch Apna College Python Module 4',
      description: 'Finish loops & functions exercise',
      dueDate: dueTime,
      reminderSet: true,
      priority: 'high',
      pageUrl: 'https://apnacollege.in/course/python/module4',
      pageTitle: 'Module 4: Loops & Functions',
    });

    expect(todo.id).toBeTruthy();
    expect(todo.title).toBe('Watch Apna College Python Module 4');
    expect(todo.description).toBe('Finish loops & functions exercise');
    expect(todo.completed).toBe(false);
    expect(todo.reminderSet).toBe(true);
    expect(todo.dueDate).toBe(dueTime);
    expect(todo.priority).toBe('high');
    expect(todo.pageUrl).toContain('apnacollege.in');

    const all = await StorageService.getTodos();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(todo.id);
  });

  it('toggles completion status of a todo item', async () => {
    const todo = await StorageService.addTodo({
      title: 'Submit Assignment',
      priority: 'medium',
    });

    expect(todo.completed).toBe(false);

    const toggled = await StorageService.toggleTodo(todo.id);
    expect(toggled[0].completed).toBe(true);

    const toggledAgain = await StorageService.toggleTodo(todo.id);
    expect(toggledAgain[0].completed).toBe(false);
  });

  it('updates an existing todo with new due date or priority', async () => {
    const todo = await StorageService.addTodo({
      title: 'Prepare presentation',
      priority: 'low',
    });

    const newDue = Date.now() + 30 * 60 * 1000;
    const updated = await StorageService.updateTodo(todo.id, {
      priority: 'high',
      dueDate: newDue,
      reminderSet: true,
    });

    expect(updated[0].priority).toBe('high');
    expect(updated[0].dueDate).toBe(newDue);
    expect(updated[0].reminderSet).toBe(true);
  });

  it('deletes a todo item', async () => {
    const t1 = await StorageService.addTodo({ title: 'Task 1' });
    const t2 = await StorageService.addTodo({ title: 'Task 2' });

    expect(await StorageService.getTodos()).toHaveLength(2);

    const remaining = await StorageService.deleteTodo(t1.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(t2.id);
  });

  it('clears completed todos only', async () => {
    const t1 = await StorageService.addTodo({ title: 'Done task 1' });
    const t2 = await StorageService.addTodo({ title: 'Pending task 2' });

    await StorageService.toggleTodo(t1.id);

    const remaining = await StorageService.clearCompletedTodos();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(t2.id);
    expect(remaining[0].completed).toBe(false);
  });

  it('playReminderChime runs safely without crashing environment', () => {
    expect(() => playReminderChime()).not.toThrow();
  });
});

