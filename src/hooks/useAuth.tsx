import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Practitioner } from '@/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  practitioner: Practitioner | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshPractitioner: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ['/book', '/booking', '/embed', '/login', '/signup'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [practitioner, setPractitioner] = useState<Practitioner | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch practitioner record for authenticated user
  async function fetchPractitioner(userId: string) {
    const { data, error } = await supabase
      .from('practitioners')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching practitioner:', error);
    }
    setPractitioner(data);
    return data;
  }

  async function refreshPractitioner() {
    if (user) {
      await fetchPractitioner(user.id);
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        await fetchPractitioner(s.user.id);
      }

      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        await fetchPractitioner(s.user.id);
      } else {
        setPractitioner(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Redirect logic: protect dashboard routes
  useEffect(() => {
    if (loading) return;

    const onPublicPath = isPublicPath(location.pathname);

    if (!user && !onPublicPath && location.pathname !== '/') {
      navigate('/login', { replace: true });
    } else if (user && !practitioner && location.pathname.startsWith('/dashboard')) {
      navigate('/onboarding', { replace: true });
    }
  }, [user, practitioner, loading, location.pathname, navigate]);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    // Redirect logic handled by useEffect — it checks practitioner state
    navigate('/dashboard');
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    navigate('/onboarding');
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setPractitioner(null);
    navigate('/login');
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        practitioner,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        refreshPractitioner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
