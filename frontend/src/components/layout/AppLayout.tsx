import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TaskCenter } from '@/components/tasks/TaskCenter';
import { useTasksPolling } from '@/components/tasks/useTasksPolling';

export function AppLayout() {
  const [tasksOpen, setTasksOpen] = useState(false);
  const { data, isLoading } = useTasksPolling(tasksOpen);
  const tasks = data ?? [];
  const activeCount = tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'error',
  ).length;

  return (
    <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <Sidebar
        tasksOpen={tasksOpen}
        activeCount={activeCount}
        onToggleTasks={() => setTasksOpen((v) => !v)}
      />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </main>
      {tasksOpen && (
        <TaskCenter
          onClose={() => setTasksOpen(false)}
          tasks={tasks}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
