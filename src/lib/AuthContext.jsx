import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  // undefined until Supabase has restored any saved session.
  const [session, setSession] = useState(undefined);
  // Result of the family-list check for a specific user id.
  const [membership, setMembership] = useState({ userId: null, error: null });

  useEffect(() => {
    // Fires INITIAL_SESSION on subscribe, then on every sign-in/out/refresh.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.rpc('is_family_member').then(({ data, error }) => {
      if (!active) return;
      let authError = null;
      if (error) {
        console.error('Family membership check failed:', error);
        authError = { type: 'unknown', message: error.message };
      } else if (!data) {
        authError = { type: 'user_not_registered', message: 'User is not on the family list' };
      }
      setMembership({ userId, error: authError });
    });
    return () => { active = false; };
  }, [userId]);

  const membershipChecked = !!userId && membership.userId === userId;

  const logout = async () => {
    await supabase.auth.signOut();
    // Don't show the previous account's data to whoever signs in next.
    queryClientInstance.clear();
  };

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null,
      isAuthenticated: !!session,
      isLoadingAuth: session === undefined || (!!userId && !membershipChecked),
      authError: membershipChecked ? membership.error : null,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
