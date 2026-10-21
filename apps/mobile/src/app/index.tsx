import { Redirect } from 'expo-router';
import { useStore } from 'zustand';
import { useServices } from '@/services/context';

/** First run goes through onboarding; afterwards the library is home. */
export default function Index() {
  const onboarded = useStore(useServices().settings, (s) => s.onboarded);
  return <Redirect href={onboarded ? '/library' : '/onboarding'} />;
}
