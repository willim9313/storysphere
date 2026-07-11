import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TaskCenter } from '@/components/tasks/TaskCenter';
import { useTasksPolling } from '@/components/tasks/useTasksPolling';
import { ToastProvider } from '@/contexts/ToastContext';
import { ToastHost } from '@/components/toast/ToastHost';
import { useTaskNotifications } from '@/hooks/useTaskNotifications';

export function AppLayout() {
  return (
    <ToastProvider>
      <AppLayoutInner />
    </ToastProvider>
  );
}

function AppLayoutInner() {
  const [tasksOpen, setTasksOpen] = useState(false);
  const { data, isLoading } = useTasksPolling(tasksOpen);
  // Fires global toasts on task-phase transitions (shares the tasks query cache).
  useTaskNotifications();
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
      <ToastHost />
    </div>
  );
}
