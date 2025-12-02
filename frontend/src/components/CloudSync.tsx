import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import {
  initGoogleApi,
  isSignedIn,
  signIn,
  signOut,
  saveToGoogleDrive,
  loadFromGoogleDrive,
  type SyncData,
} from '../lib/googleDrive';
import type { StatementInfo } from '../types';

interface CloudSyncProps {
  statements: StatementInfo[];
  userMappings: Map<string, string>;
  onDataLoaded: (statements: StatementInfo[], mappings: Map<string, string>) => void;
}

type SyncStatus = 'idle' | 'loading' | 'syncing' | 'success' | 'error';

export function CloudSync({ statements, userMappings, onDataLoaded }: CloudSyncProps) {
  const [available, setAvailable] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    initGoogleApi().then((success) => {
      setAvailable(success);
      if (success) {
        setSignedIn(isSignedIn());
      }
    });
  }, []);

  const handleSignIn = async () => {
    setStatus('loading');
    const success = await signIn();
    setSignedIn(success);
    setStatus(success ? 'idle' : 'error');
    if (!success) {
      setMessage('Failed to sign in');
    }
  };

  const handleSignOut = () => {
    signOut();
    setSignedIn(false);
    setMessage('');
  };

  const handleSave = async () => {
    setStatus('syncing');
    setMessage('Saving to Google Drive...');

    // Convert statements to serializable format
    const serializedStatements = statements.map((stmt) => ({
      ...stmt,
      transactions: stmt.transactions.map((tx) => ({
        ...tx,
        date: tx.date.toISOString(),
      })),
    }));

    const data: SyncData = {
      statements: serializedStatements,
      userMappings: Object.fromEntries(userMappings),
      version: 1,
      lastModified: new Date().toISOString(),
    };

    const success = await saveToGoogleDrive(data);
    setStatus(success ? 'success' : 'error');
    setMessage(success ? 'Saved to Google Drive' : 'Failed to save');

    if (success) {
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleLoad = async () => {
    setStatus('syncing');
    setMessage('Loading from Google Drive...');

    const data = await loadFromGoogleDrive();
    
    if (data) {
      // Convert all dates back to Date objects (they're serialized as ISO strings)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadedStatements: StatementInfo[] = (data.statements as any[]).map((stmt) => ({
        ...stmt,
        periodStart: new Date(stmt.periodStart),
        periodEnd: new Date(stmt.periodEnd),
        transactions: stmt.transactions.map((tx: Record<string, unknown>) => ({
          ...tx,
          date: new Date(tx.date as string),
        })),
      }));

      const loadedMappings = new Map(Object.entries(data.userMappings || {}));
      
      onDataLoaded(loadedStatements, loadedMappings);
      setStatus('success');
      setMessage(`Loaded ${loadedStatements.length} statements`);
      setTimeout(() => setStatus('idle'), 2000);
    } else {
      setStatus('error');
      setMessage('No data found or failed to load');
    }
  };

  if (!available) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-sm" title="Google Drive sync not configured">
        <CloudOff className="w-4 h-4" />
        <span className="hidden sm:inline">Sync unavailable</span>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <button
        onClick={handleSignIn}
        disabled={status === 'loading'}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {status === 'loading' ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : (
          <Cloud className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">Sign in to sync</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {/* Status indicator */}
      {status === 'syncing' && (
        <div className="flex items-center gap-1 text-blue-600 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="hidden sm:inline">{message}</span>
        </div>
      )}
      {status === 'success' && (
        <div className="flex items-center gap-1 text-green-600 text-sm">
          <Check className="w-4 h-4" />
          <span className="hidden sm:inline">{message}</span>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-1 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span className="hidden sm:inline">{message}</span>
        </div>
      )}

      {/* Sync buttons */}
      {status === 'idle' && (
        <>
          <button
            onClick={handleLoad}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
            title="Load from Google Drive"
          >
            <Cloud className="w-4 h-4" />
            <span className="hidden sm:inline">Load</span>
          </button>
          <button
            onClick={handleSave}
            disabled={statements.length === 0}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
            title="Save to Google Drive"
          >
            <Cloud className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            onClick={handleSignOut}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            title="Sign out"
          >
            <CloudOff className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
}
