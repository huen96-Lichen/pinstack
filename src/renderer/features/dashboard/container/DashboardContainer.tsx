import { ModernDashboardView } from '../modern/ModernDashboardView';
import { useDashboardController } from '../shared/dashboard.hooks';
import { useDomClasses } from '../../../shared/useDomClasses';

export function DashboardContainer(): JSX.Element {
  const { viewProps } = useDashboardController();
  useDomClasses();

  return (
    <main className="h-full bg-transparent">
      <ModernDashboardView view={viewProps} />
    </main>
  );
}
