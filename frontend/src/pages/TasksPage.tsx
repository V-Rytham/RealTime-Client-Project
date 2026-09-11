import TaskList from '../components/TaskList';
import ActivityFeed from '../components/ActivityFeed';

export default function TasksPage() {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h2>All Tasks</h2>
      <TaskList />
      <ActivityFeed />
    </div>
  );
}
