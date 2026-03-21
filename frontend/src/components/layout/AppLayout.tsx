import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ChatContextProvider } from '@/contexts/ChatContext';
import { ChatWidget } from '@/components/chat/ChatWidget';

export function AppLayout() {
  return (
    <ChatContextProvider>
      <div className="flex h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Outlet />
        </main>
        <ChatWidget />
      </div>
    </ChatContextProvider>
  );
}
