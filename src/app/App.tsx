import { AppStateProvider } from './AppState';
import { formatRoute, useHashRoute, type Route } from './router';
import { AppShell } from '../components/layout/AppShell';
import { PracticeScreen } from '../components/practice/PracticeScreen';
import { RudimentLibrary } from '../components/rudiment-library/RudimentLibrary';
import { EditorScreen } from '../components/exercise-editor/EditorScreen';
import { MyExercises } from '../components/my-exercises/MyExercises';
import { SettingsScreen } from '../components/settings/SettingsScreen';
import { FeedbackProvider } from '../components/ui/feedback';
import { StudyScreen } from '../components/study/StudyScreen';
import { StudyProvider } from '../study/StudyContext';

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'practice':
      return <PracticeScreen />;
    case 'rudiments':
      return <RudimentLibrary />;
    case 'editor':
      // A chave recria o editor (e seu histórico) a cada exercício aberto.
      return <EditorScreen key={formatRoute(route)} route={route} />;
    case 'mine':
      return <MyExercises />;
    case 'study':
      return <StudyScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}

export function App() {
  const route = useHashRoute();
  return (
    <FeedbackProvider>
      <AppStateProvider>
        <StudyProvider>
          <AppShell route={route}>
            <Screen route={route} />
          </AppShell>
        </StudyProvider>
      </AppStateProvider>
    </FeedbackProvider>
  );
}
