import { useState, useEffect, useRef, useCallback } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, AlertTriangle } from 'lucide-react';
import {
  initGoogleApi,
  isSignedIn,
  tryRestoreSession,
  signIn,
  signOut,
  saveToGoogleDrive,
  loadFromGoogleDrive,
  checkSyncStatus,
  setLocalModifiedTime,
  getLocalModifiedTime,
  type SyncData,
  type ConflictResolution,
} from '../lib/googleDrive';
import type { StatementInfo } from '../types';

interface CloudSyncProps {
  statements: StatementInfo[];
  userMappings: Map<string, string>;
  onDataLoaded: (statements: StatementInfo[], mappings: Map<string, string>) => void;
}

type SyncStatus = 'idle' | 'loading' | 'syncing' | 'success' | 'error' | 'conflict';

export function CloudSync({ statements, userMappings, onDataLoaded }: CloudSyncProps) {
  const [available, setAvailable] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState<ConflictResolution>('none');
  const lastStatementsRef = useRef<string>('');
  const autoSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parse cloud data to statements
  const parseCloudData = (data: SyncData): { statements: StatementInfo[]; mappings: Map<string, string> } => {
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
    return { statements: loadedStatements, mappings: loadedMappings };
  };

  // Serialize statements for comparison and saving
  const serializeStatements = useCallback((stmts: StatementInfo[], mappings: Map<string, string>): SyncData => {
    const serializedStatements = stmts.map((stmt) => ({
      ...stmt,
      periodStart: stmt.periodStart.toISOString(),
      periodEnd: stmt.periodEnd.toISOString(),
      transactions: stmt.transactions.map((tx) => ({
        ...tx,
        date: tx.date.toISOString(),
      })),
    }));
    return {
      statements: serializedStatements,
      userMappings: Object.fromEntries(mappings),
      version: 1,
      lastModified: new Date().toISOString(),
    };
  }, []);

  // Auto-sync: check for conflicts and sync
  const performAutoSync = useCallback(async () => {
    if (!signedIn || status === 'syncing' || status === 'conflict') return;
    
    const syncStatus = await checkSyncStatus();
    
    console.log('[CloudSync] performAutoSync:', { syncStatus, statementsCount: statements.length });
    
    if (syncStatus === 'cloud') {
      // Cloud is newer than local - auto-pull
      // checkSyncStatus returns 'cloud' only when cloudTime > localTime + buffer
      // This means local hasn't been modified since last sync, safe to pull
      console.log('[CloudSync] Cloud is newer, auto-pulling...');
      setStatus('syncing');
      setMessage('Loading from cloud...');
      const data = await loadFromGoogleDrive();
      if (data) {
        const { statements: loadedStmts, mappings } = parseCloudData(data);
        setLocalModifiedTime(Date.now());
        onDataLoaded(loadedStmts, mappings);
        setStatus('success');
        setMessage('Synced from cloud');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('idle');
      }
    } else if (syncStatus === 'local' && statements.length > 0) {
      // Local is newer - auto-push to cloud
      console.log('[CloudSync] Local is newer, pushing to cloud...');
      setStatus('syncing');
      setMessage('Syncing to cloud...');
      const data = serializeStatements(statements, userMappings);
      const success = await saveToGoogleDrive(data);
      if (success) {
        setLocalModifiedTime(Date.now());
        setStatus('success');
        setMessage('Synced');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
        setMessage('Sync failed');
      }
    }
  }, [signedIn, status, statements, userMappings, onDataLoaded, parseCloudData, serializeStatements]);

  // Initialize on mount
  useEffect(() => {
    let mounted = true;
    
    initGoogleApi().then(async (success) => {
      if (!mounted) return;
      setAvailable(success);
      if (success) {
        // Try to restore session from cached token
        const restored = await tryRestoreSession();
        if (!mounted) return;
        const isNowSignedIn = restored || isSignedIn();
        setSignedIn(isNowSignedIn);
        
        if (isNowSignedIn) {
          // Check sync status on startup
          console.log('[CloudSync] Signed in, checking cloud...');
          const syncNeeded = await checkSyncStatus();
          console.log('[CloudSync] Sync status:', syncNeeded);
          
          if (syncNeeded === 'cloud') {
            // Cloud is newer - auto-pull (this means local hasn't changed since last sync)
            // checkSyncStatus returns 'cloud' only when cloudTime > localTime
            // which means no local changes were made after last sync
            console.log('[CloudSync] Cloud is newer, auto-pulling...');
            setStatus('syncing');
            setMessage('Loading from cloud...');
            const data = await loadFromGoogleDrive();
            if (data && mounted) {
              const { statements: loadedStmts, mappings } = parseCloudData(data);
              setLocalModifiedTime(Date.now());
              onDataLoaded(loadedStmts, mappings);
              setStatus('success');
              setMessage('Loaded from cloud');
              setTimeout(() => mounted && setStatus('idle'), 2000);
            } else if (mounted) {
              setStatus('idle');
            }
          } else if (syncNeeded === 'local') {
            // Local is newer - will auto-push when statements are available
            console.log('[CloudSync] Local is newer, will sync after statements load');
          }
        }
      }
    });
    
    return () => { mounted = false; };
  }, [onDataLoaded, parseCloudData]);

  // Auto-sync when statements change (debounced)
  // Includes category changes, hidden status, etc.
  useEffect(() => {
    if (!signedIn || statements.length === 0) return;
    
    // Hash includes categories and hidden status to detect changes
    const currentHash = JSON.stringify(statements.map(s => ({
      f: s.filename,
      t: s.transactions.map(tx => `${tx.description}|${tx.category}|${tx.hidden}`)
    })));
    if (currentHash === lastStatementsRef.current) return;
    lastStatementsRef.current = currentHash;
    
    // Mark local as modified
    setLocalModifiedTime(Date.now());
    
    // Debounce auto-sync (wait 3 seconds after last change)
    if (autoSyncTimeoutRef.current) {
      clearTimeout(autoSyncTimeoutRef.current);
    }
    autoSyncTimeoutRef.current = setTimeout(() => {
      performAutoSync();
    }, 3000);
    
    return () => {
      if (autoSyncTimeoutRef.current) {
        clearTimeout(autoSyncTimeoutRef.current);
      }
    };
  }, [signedIn, statements, performAutoSync]);

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
    setConflict('none');
  };

  const handleSave = async () => {
    setStatus('syncing');
    setMessage('Saving to Google Drive...');

    const data = serializeStatements(statements, userMappings);
    const success = await saveToGoogleDrive(data);
    
    if (success) {
      setLocalModifiedTime(Date.now());
      setStatus('success');
      setMessage('Saved');
      setConflict('none');
      setTimeout(() => setStatus('idle'), 2000);
    } else {
      setStatus('error');
      setMessage('Failed to save');
    }
  };

  // Smart sync: pull if no local changes, push if local is newer
  const handleSmartSync = async () => {
    setStatus('syncing');
    setMessage('Checking...');
    
    const syncStatus = await checkSyncStatus();
    const localModified = getLocalModifiedTime();
    
    console.log('[CloudSync] handleSmartSync:', { syncStatus, localModified, statementsCount: statements.length });
    
    if (syncStatus === 'cloud' || (syncStatus === 'none' && localModified === 0)) {
      // Cloud is newer or no local data - pull
      console.log('[CloudSync] Pulling from cloud...');
      setMessage('Loading from cloud...');
      const data = await loadFromGoogleDrive();
      console.log('[CloudSync] Loaded data:', data ? `${(data.statements as unknown[])?.length} statements` : 'null');
      if (data) {
        const { statements: loadedStmts, mappings } = parseCloudData(data);
        setLocalModifiedTime(Date.now());
        onDataLoaded(loadedStmts, mappings);
        setStatus('success');
        setMessage('Loaded from cloud');
        setConflict('none');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        // No cloud data, nothing to do
        setStatus('success');
        setMessage('No cloud data');
        setTimeout(() => setStatus('idle'), 2000);
      }
    } else if (syncStatus === 'local' && statements.length > 0) {
      // Local is newer - push
      console.log('[CloudSync] Pushing to cloud...');
      setMessage('Saving to cloud...');
      const data = serializeStatements(statements, userMappings);
      const success = await saveToGoogleDrive(data);
      if (success) {
        setLocalModifiedTime(Date.now());
        setStatus('success');
        setMessage('Saved to cloud');
        setConflict('none');
        setTimeout(() => setStatus('idle'), 2000);
      } else {
        setStatus('error');
        setMessage('Failed to save');
      }
    } else {
      // Already in sync
      console.log('[CloudSync] Already in sync');
      setStatus('success');
      setMessage('In sync');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleLoad = async () => {
    setStatus('syncing');
    setMessage('Loading from Google Drive...');

    const data = await loadFromGoogleDrive();
    
    if (data) {
      const { statements: loadedStmts, mappings } = parseCloudData(data);
      setLocalModifiedTime(Date.now());
      onDataLoaded(loadedStmts, mappings);
      setStatus('success');
      setMessage(`Loaded ${loadedStmts.length} statements`);
      setConflict('none');
      setTimeout(() => setStatus('idle'), 2000);
    } else {
      setStatus('error');
      setMessage('No data found');
    }
  };

  // Handle conflict resolution
  const handleUseCloud = async () => {
    await handleLoad();
  };

  const handleUseLocal = async () => {
    await handleSave();
  };

  const handleDismissConflict = () => {
    setConflict('none');
    setStatus('idle');
    setMessage('');
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
      {/* Conflict resolution UI */}
      {status === 'conflict' && conflict === 'cloud' && (
        <div className="flex items-center gap-2 text-amber-600 text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span className="hidden sm:inline">Cloud newer</span>
          <button
            onClick={handleUseCloud}
            className="px-2 py-0.5 text-xs bg-amber-100 hover:bg-amber-200 rounded"
            title="Replace local with cloud data"
          >
            Use Cloud
          </button>
          <button
            onClick={handleUseLocal}
            className="px-2 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 rounded"
            title="Overwrite cloud with local data"
          >
            Keep Local
          </button>
          <button
            onClick={handleDismissConflict}
            className="p-0.5 text-gray-400 hover:text-gray-600"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

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

      {/* Sync buttons - only show when idle */}
      {status === 'idle' && (
        <>
          <div className="flex items-center text-green-600" title="Auto-sync enabled">
            <Cloud className="w-4 h-4" />
            <Check className="w-3 h-3 -ml-2 -mt-2" />
          </div>
          <button
            onClick={handleSmartSync}
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
            title="Sync with Google Drive (pulls if no local changes, pushes if local is newer)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sync</span>
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
